import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
	createFixture,
	delegateAndClaim,
	finishWithTaskStatus,
	insertCase,
	loadCompleteRuntimeTranscript,
	RUNTIME_SECRET,
} from "./testSupport.test-helper";

describe("agent runs, leases, and transcript", () => {
	it("claims only the exact run delivered by a push", async () => {
		const fixture = await createFixture();
		const first = await fixture.actor.mutation(api.agent.tasks.delegateCase, {
			caseId: fixture.caseId,
			input: "First queued task.",
		});
		const second = await fixture.actor.mutation(api.agent.tasks.delegateCase, {
			caseId: fixture.secondCaseId,
			input: "Second queued task.",
		});
		const secondToken = crypto.randomUUID();

		await expect(
			fixture.base.mutation(api.agent.runtime.claimRun, {
				runtimeSecret: "not-the-runtime-secret",
				runId: second.runId,
				leaseGeneration: 0,
				claimToken: secondToken,
				leaseDurationMs: 60_000,
			}),
		).rejects.toThrow("access denied");
		await expect(
			fixture.base.mutation(api.agent.runtime.claimRun, {
				runtimeSecret: RUNTIME_SECRET,
				runId: second.runId,
				leaseGeneration: 99,
				claimToken: secondToken,
				leaseDurationMs: 60_000,
			}),
		).resolves.toBeNull();
		const exactClaim = await fixture.base.mutation(api.agent.runtime.claimRun, {
			runtimeSecret: RUNTIME_SECRET,
			runId: second.runId,
			leaseGeneration: 0,
			claimToken: secondToken,
			leaseDurationMs: 60_000,
		});

		expect(exactClaim?.runId).toBe(second.runId);
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(first.runId)),
		).toMatchObject({ status: "queued" });
		await expect(
			fixture.base.mutation(api.agent.runtime.claimRun, {
				runtimeSecret: RUNTIME_SECRET,
				runId: second.runId,
				leaseGeneration: 0,
				claimToken: crypto.randomUUID(),
				leaseDurationMs: 60_000,
			}),
		).resolves.toBeNull();
		const firstClaim = await fixture.base.mutation(api.agent.runtime.claimRun, {
			runtimeSecret: RUNTIME_SECRET,
			runId: first.runId,
			leaseGeneration: 0,
			claimToken: crypto.randomUUID(),
			leaseDurationMs: 60_000,
		});
		expect(firstClaim?.runId).toBe(first.runId);
	});

	it("durably pushes each new queue generation", async () => {
		const fixture = await createFixture();
		const delegation = await fixture.actor.mutation(
			api.agent.tasks.delegateCase,
			{
				caseId: fixture.caseId,
				input: "Push this run.",
			},
		);
		const initialDeliveries = await fixture.base.run(async (ctx) =>
			(await ctx.db.system.query("_scheduled_functions").collect()).filter(
				({ name }) => name.startsWith("agent/push:"),
			),
		);
		expect(initialDeliveries).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "agent/push:deliver",
					args: [
						{
							runId: delegation.runId,
							leaseGeneration: 0,
							attempt: 0,
						},
					],
				}),
				expect.objectContaining({
					name: "agent/push:recoverDelivery",
					args: [
						{
							runId: delegation.runId,
							leaseGeneration: 0,
							attempt: 0,
						},
					],
				}),
			]),
		);

		const claimToken = crypto.randomUUID();
		await fixture.base.mutation(api.agent.runtime.claimRun, {
			runtimeSecret: RUNTIME_SECRET,
			runId: delegation.runId,
			leaseGeneration: 0,
			claimToken,
			leaseDurationMs: 60_000,
		});
		await fixture.base.run(async (ctx) => {
			await ctx.db.patch(delegation.runId, { leaseExpiresAt: 0 });
		});
		await fixture.base.mutation(internal.agent.leases.requeueExpiredRun, {
			runId: delegation.runId,
			leaseGeneration: 1,
		});
		const requeuedDeliveries = await fixture.base.run(async (ctx) =>
			(await ctx.db.system.query("_scheduled_functions").collect()).filter(
				({ name, args }) =>
					name.startsWith("agent/push:") &&
					(args[0] as { leaseGeneration?: number }).leaseGeneration === 1,
			),
		);
		expect(requeuedDeliveries.map(({ name }) => name).sort()).toEqual([
			"agent/push:deliver",
			"agent/push:recoverDelivery",
		]);
	});

	it("advances only one push retry chain while the generation is queued", async () => {
		const fixture = await createFixture();
		const delegation = await fixture.actor.mutation(
			api.agent.tasks.delegateCase,
			{
				caseId: fixture.caseId,
				input: "Retry this delivery safely.",
			},
		);
		const initialDelivery = {
			runId: delegation.runId,
			leaseGeneration: 0,
			attempt: 0,
		};

		await expect(
			fixture.base.mutation(internal.agent.push.retryDelivery, initialDelivery),
		).resolves.toBe(true);
		await expect(
			fixture.base.mutation(
				internal.agent.push.recoverDelivery,
				initialDelivery,
			),
		).resolves.toBe(false);
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(delegation.runId)),
		).toMatchObject({
			status: "queued",
			pushDeliveryAttempt: 1,
		});

		const nextAttemptFunctions = await fixture.base.run(async (ctx) =>
			(await ctx.db.system.query("_scheduled_functions").collect()).filter(
				({ name, args }) =>
					name.startsWith("agent/push:") &&
					(args[0] as { attempt?: number }).attempt === 1,
			),
		);
		expect(nextAttemptFunctions.map(({ name }) => name).sort()).toEqual([
			"agent/push:deliver",
			"agent/push:recoverDelivery",
		]);
		await fixture.base.mutation(api.agent.runtime.claimRun, {
			runtimeSecret: RUNTIME_SECRET,
			runId: delegation.runId,
			leaseGeneration: 0,
			claimToken: crypto.randomUUID(),
			leaseDurationMs: 60_000,
		});
		await expect(
			fixture.base.mutation(internal.agent.push.retryDelivery, {
				...initialDelivery,
				attempt: 1,
			}),
		).resolves.toBe(false);
	});

	it("stores queued input as a member message and running input as same-turn steering", async () => {
		const queuedFixture = await createFixture();
		const delegation = await queuedFixture.actor.mutation(
			api.agent.tasks.delegateCase,
			{
				caseId: queuedFixture.caseId,
				input: "Start with the case history.",
			},
		);
		const queuedMessage = await queuedFixture.actor.mutation(
			api.agent.tasks.sendMessage,
			{
				taskId: delegation.taskId,
				input: "Check the linked email too.",
			},
		);
		expect(queuedMessage).toEqual({
			kind: "message",
			turnId: delegation.turnId,
			runId: delegation.runId,
		});
		const queuedItems = await queuedFixture.base.run(async (ctx) =>
			ctx.db
				.query("agentItems")
				.withIndex("by_turn_id_and_sequence", (index) =>
					index.eq("turnId", delegation.turnId),
				)
				.collect(),
		);
		expect(queuedItems).toEqual([
			expect.objectContaining({
				kind: "member_message",
				body: "Start with the case history.",
			}),
			expect.objectContaining({
				kind: "member_message",
				body: "Check the linked email too.",
			}),
		]);

		const runningFixture = await createFixture();
		const claim = await delegateAndClaim(runningFixture);
		const steering = await runningFixture.actor.mutation(
			api.agent.tasks.sendMessage,
			{
				taskId: claim.taskId,
				input: "Prioritize the newest evidence.",
			},
		);
		expect(steering).toEqual({
			kind: "steer",
			turnId: claim.turnId,
			runId: claim.runId,
		});
		expect(
			await runningFixture.base.mutation(
				api.agent.runtime.getSteeringMessages,
				{
					runtimeSecret: RUNTIME_SECRET,
					runId: claim.runId,
					claimToken: claim.claimToken,
					afterSequence: 0,
				},
			),
		).toEqual([
			{
				body: "Prioritize the newest evidence.",
				sequence: 2,
			},
		]);
	});

	it("atomically claims an exact run and requeues it when the current lease expires", async () => {
		const fixture = await createFixture();
		const delegation = await fixture.actor.mutation(
			api.agent.tasks.delegateCase,
			{
				caseId: fixture.caseId,
				input: "Claim me once.",
			},
		);
		const firstToken = crypto.randomUUID();
		const competingToken = crypto.randomUUID();
		const [firstClaim, overlappingClaim] = await Promise.all([
			fixture.base.mutation(api.agent.runtime.claimRun, {
				runtimeSecret: RUNTIME_SECRET,
				runId: delegation.runId,
				leaseGeneration: 0,
				claimToken: firstToken,
				leaseDurationMs: 60_000,
			}),
			fixture.base.mutation(api.agent.runtime.claimRun, {
				runtimeSecret: RUNTIME_SECRET,
				runId: delegation.runId,
				leaseGeneration: 0,
				claimToken: competingToken,
				leaseDurationMs: 60_000,
			}),
		]);
		expect([firstClaim, overlappingClaim].filter(Boolean)).toHaveLength(1);
		const winningToken = firstClaim ? firstToken : competingToken;

		await fixture.base.mutation(api.agent.runtime.renewRunLease, {
			runtimeSecret: RUNTIME_SECRET,
			runId: delegation.runId,
			claimToken: winningToken,
			leaseDurationMs: 60_000,
		});
		const renewedState = await fixture.base.run(async (ctx) => ({
			run: await ctx.db.get(delegation.runId),
			watchdogs: (
				await ctx.db.system.query("_scheduled_functions").collect()
			).filter(({ name }) => name === "agent/leases:requeueExpiredRun"),
		}));
		expect(renewedState.run).toMatchObject({
			status: "running",
			attemptCount: 1,
			leaseFailureCount: 0,
			leaseGeneration: 2,
		});
		expect(renewedState.watchdogs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					args: [{ runId: delegation.runId, leaseGeneration: 1 }],
					state: { kind: "pending" },
				}),
				expect.objectContaining({
					args: [{ runId: delegation.runId, leaseGeneration: 2 }],
					state: { kind: "pending" },
				}),
			]),
		);

		await fixture.base.run(async (ctx) => {
			await ctx.db.patch(delegation.runId, { leaseExpiresAt: 0 });
		});
		await expect(
			fixture.base.mutation(api.agent.runtime.updateActivity, {
				runtimeSecret: RUNTIME_SECRET,
				runId: delegation.runId,
				claimToken: winningToken,
				title: "A write after the lease expired",
			}),
		).rejects.toThrow("no longer claimed");
		await expect(
			fixture.base.mutation(api.agent.runtime.renewRunLease, {
				runtimeSecret: RUNTIME_SECRET,
				runId: delegation.runId,
				claimToken: winningToken,
				leaseDurationMs: 60_000,
			}),
		).rejects.toThrow("no longer claimed");
		await expect(
			fixture.base.mutation(api.agent.runtime.getTranscript, {
				runtimeSecret: RUNTIME_SECRET,
				runId: delegation.runId,
				claimToken: winningToken,
				paginationOpts: { numItems: 10, cursor: null },
			}),
		).rejects.toThrow("no longer claimed");
		await expect(
			fixture.base.mutation(api.agent.tools.readCase, {
				runtimeSecret: RUNTIME_SECRET,
				runId: delegation.runId,
				claimToken: winningToken,
				caseId: fixture.caseId,
			}),
		).rejects.toThrow("no longer claimed");
		await fixture.base.mutation(internal.agent.leases.requeueExpiredRun, {
			runId: delegation.runId,
			leaseGeneration: 1,
		});
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(delegation.runId)),
		).toMatchObject({ status: "running", leaseGeneration: 2 });

		await fixture.base.mutation(internal.agent.leases.requeueExpiredRun, {
			runId: delegation.runId,
			leaseGeneration: 2,
		});
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(delegation.runId)),
		).toMatchObject({ status: "queued", leaseGeneration: 2 });

		const secondToken = crypto.randomUUID();
		const reclaimed = await fixture.base.mutation(api.agent.runtime.claimRun, {
			runtimeSecret: RUNTIME_SECRET,
			runId: delegation.runId,
			leaseGeneration: 2,
			claimToken: secondToken,
			leaseDurationMs: 60_000,
		});
		expect(reclaimed?.runId).toBe(delegation.runId);
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(delegation.runId)),
		).toMatchObject({
			status: "running",
			attemptCount: 2,
			leaseFailureCount: 1,
			leaseGeneration: 3,
		});
		await fixture.base.mutation(internal.agent.leases.requeueExpiredRun, {
			runId: delegation.runId,
			leaseGeneration: 2,
		});
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(delegation.runId)),
		).toMatchObject({ status: "running", leaseGeneration: 3 });

		await expect(
			fixture.base.mutation(api.agent.runtime.updateActivity, {
				runtimeSecret: RUNTIME_SECRET,
				runId: delegation.runId,
				claimToken: winningToken,
				title: "A stale write",
			}),
		).rejects.toThrow("no longer claimed");
		await fixture.base.mutation(api.agent.runtime.updateActivity, {
			runtimeSecret: RUNTIME_SECRET,
			runId: delegation.runId,
			claimToken: secondToken,
			title: "The current worker is active",
		});
	});

	it("terminalizes a run after the bounded lease retry limit", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		const reclaimedRunIds: Array<Id<"agentRuns"> | undefined> = [];
		for (let loss = 1; loss <= 3; loss += 1) {
			const run = await fixture.base.run(async (ctx) =>
				ctx.db.get(claim.runId),
			);
			if (!run || run.status !== "running") {
				throw new Error("Expected running lease-loss fixture");
			}
			await fixture.base.run(async (ctx) => {
				await ctx.db.patch(claim.runId, { leaseExpiresAt: 0 });
			});
			await fixture.base.mutation(internal.agent.leases.requeueExpiredRun, {
				runId: claim.runId,
				leaseGeneration: run.leaseGeneration,
			});
			if (loss < 3) {
				const reclaimed = await fixture.base.mutation(
					api.agent.runtime.claimRun,
					{
						runtimeSecret: RUNTIME_SECRET,
						runId: claim.runId,
						leaseGeneration: run.leaseGeneration,
						claimToken: crypto.randomUUID(),
						leaseDurationMs: 60_000,
					},
				);
				reclaimedRunIds.push(reclaimed?.runId);
			}
		}
		expect(reclaimedRunIds).toEqual([claim.runId, claim.runId]);
		const state = await fixture.base.run(async (ctx) => ({
			task: await ctx.db.get(claim.taskId),
			run: await ctx.db.get(claim.runId),
		}));
		expect(state.run).toMatchObject({
			status: "failed",
			attemptCount: 3,
			leaseFailureCount: 3,
			error: expect.stringContaining("repeatedly losing its worker lease"),
		});
		expect(state.task).toMatchObject({
			status: "failed",
			activeRunIds: [],
			ownershipReleasedAt: expect.any(Number),
		});
	});

	it("skips and cancels queued runs whose task has already ended", async () => {
		const fixture = await createFixture();
		const staleDelegation = await fixture.actor.mutation(
			api.agent.tasks.delegateCase,
			{
				caseId: fixture.caseId,
				input: "This run will become stale.",
			},
		);
		const freshCaseId = await fixture.base.run(async (ctx) =>
			insertCase(
				ctx,
				fixture.organizationId,
				"CASE-FRESH-AGENT",
				"Fresh agent case",
			),
		);
		const freshDelegation = await fixture.actor.mutation(
			api.agent.tasks.delegateCase,
			{
				caseId: freshCaseId,
				input: "This run should be claimed.",
			},
		);
		await fixture.base.run(async (ctx) => {
			const staleTask = await ctx.db.get(staleDelegation.taskId);
			if (!staleTask) throw new Error("Expected stale task");
			await ctx.db.replace("agentTasks", staleTask._id, {
				organizationId: staleTask.organizationId,
				anchorCaseId: staleTask.anchorCaseId,
				agentKey: staleTask.agentKey,
				status: "cancelled",
				requestedAt: staleTask.requestedAt,
				requestedBy: staleTask.requestedBy,
				requestedByMemberId: staleTask.requestedByMemberId,
				reason: "Cancelled before execution.",
				ownershipReleasedAt: Date.now(),
				activeRunIds: [],
				activeApprovalIds: [],
			});
		});

		const staleClaim = await fixture.base.mutation(api.agent.runtime.claimRun, {
			runtimeSecret: RUNTIME_SECRET,
			runId: staleDelegation.runId,
			leaseGeneration: 0,
			claimToken: crypto.randomUUID(),
			leaseDurationMs: 60_000,
		});
		expect(staleClaim).toBeNull();
		const claim = await fixture.base.mutation(api.agent.runtime.claimRun, {
			runtimeSecret: RUNTIME_SECRET,
			runId: freshDelegation.runId,
			leaseGeneration: 0,
			claimToken: crypto.randomUUID(),
			leaseDurationMs: 60_000,
		});
		expect(claim?.runId).toBe(freshDelegation.runId);
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(staleDelegation.runId)),
		).toMatchObject({
			status: "cancelled",
			reason: "The task ended before this run could continue.",
		});
	});

	it("coalesces agent text in place and preserves one total item order", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		await expect(
			fixture.base.mutation(api.agent.runtime.startAgentMessage, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				body: "   ",
			}),
		).rejects.toThrow("Agent message text is required");
		await fixture.base.mutation(api.agent.runtime.updateActivity, {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
			title: "Inspecting the case",
			detail: "Reviewing the durable event history.",
		});
		const messageItemId = await fixture.base.mutation(
			api.agent.runtime.startAgentMessage,
			{
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				body: "Draft",
			},
		);
		const finalBody = `Credential-like text Authorization: Bearer model-authored-value\n${"x".repeat(20_000)}`;
		for (const body of ["Draft", finalBody]) {
			await fixture.base.mutation(api.agent.runtime.updateAgentMessage, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				itemId: messageItemId,
				body,
			});
		}
		const inputJson = JSON.stringify({
			caseId: fixture.caseId,
			body: `api_key=model-defined-value ${"i".repeat(40_000)}`,
		});
		const outputJson = JSON.stringify({
			title: "Agent case",
			body: `Authorization: Bearer external-value ${"o".repeat(40_000)}`,
		});
		await fixture.base.mutation(api.agent.runtime.recordToolStarted, {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
			toolCallId: "tool-1",
			toolName: "read_case",
			inputJson,
			summary: "Reading a case",
		});
		await fixture.base.mutation(api.agent.runtime.recordToolFinished, {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
			toolCallId: "tool-1",
			result: {
				status: "completed",
				outputJson,
			},
		});

		const transcript = await loadCompleteRuntimeTranscript(fixture, claim, 10);
		expect(transcript.turns[0]?.items.map((item) => item.sequence)).toEqual([
			1, 2, 3, 4,
		]);
		expect(transcript.turns[0]?.items[2]).toMatchObject({
			kind: "agent_message",
			body: finalBody,
		});
		expect(transcript.turns[0]?.items[1]).toMatchObject({
			kind: "activity",
			title: "Inspecting the case",
			detail: "Reviewing the durable event history.",
		});
		expect(transcript.turns[0]?.items[3]).toMatchObject({
			kind: "tool",
			status: "completed",
			inputJson,
			outputJson,
		});
	});

	it("prevents a superseded worker from acting on or failing a resumed task", async () => {
		const fixture = await createFixture();
		const firstClaim = await delegateAndClaim(fixture);
		await fixture.base.run(async (ctx) => {
			const task = await ctx.db.get(firstClaim.taskId);
			if (!task) throw new Error("Expected task");
			await ctx.db.replace("agentTasks", task._id, {
				organizationId: task.organizationId,
				anchorCaseId: task.anchorCaseId,
				agentKey: task.agentKey,
				requestedAt: task.requestedAt,
				requestedBy: task.requestedBy,
				requestedByMemberId: task.requestedByMemberId,
				status: "waiting",
				waitingReason: "Waiting for member input.",
				ownershipReleasedAt: null,
				activeRunIds: [],
				activeApprovalIds: [],
			});
		});

		const resumed = await fixture.actor.mutation(api.agent.tasks.sendMessage, {
			taskId: firstClaim.taskId,
			input: "Continue with the new information.",
		});

		await expect(
			fixture.base.mutation(api.agent.tools.readCase, {
				runtimeSecret: RUNTIME_SECRET,
				runId: firstClaim.runId,
				claimToken: firstClaim.claimToken,
				caseId: fixture.caseId,
			}),
		).rejects.toThrow("superseded");
		await expect(
			fixture.base.mutation(api.agent.runtime.renewRunLease, {
				runtimeSecret: RUNTIME_SECRET,
				runId: firstClaim.runId,
				claimToken: firstClaim.claimToken,
				leaseDurationMs: 60_000,
			}),
		).rejects.toThrow("superseded");

		await fixture.base.mutation(api.agent.runtime.failRun, {
			runtimeSecret: RUNTIME_SECRET,
			runId: firstClaim.runId,
			claimToken: firstClaim.claimToken,
			message: "The superseded worker stopped.",
		});

		const state = await fixture.base.run(async (ctx) => ({
			task: await ctx.db.get(firstClaim.taskId),
			oldRun: await ctx.db.get(firstClaim.runId),
			newRun: await ctx.db.get(resumed.runId),
		}));
		expect(state.task).toMatchObject({
			status: "active",
			ownershipReleasedAt: null,
		});
		expect(state.oldRun).toMatchObject({
			status: "failed",
			error: "The superseded worker stopped.",
		});
		expect(state.newRun).toMatchObject({ status: "queued" });
	});

	it("sends a failed task a new member turn and queued run", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		await fixture.base.mutation(api.agent.runtime.failRun, {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
			message: "The provider request failed.",
		});

		const resumed = await fixture.actor.mutation(api.agent.tasks.sendMessage, {
			taskId: claim.taskId,
			input: "Try the task again.",
		});
		expect(resumed.kind).toBe("message");

		const state = await fixture.base.run(async (ctx) => ({
			task: await ctx.db.get(claim.taskId),
			turn: await ctx.db.get(resumed.turnId),
			run: await ctx.db.get(resumed.runId),
			items: await ctx.db
				.query("agentItems")
				.withIndex("by_turn_id_and_sequence", (index) =>
					index.eq("turnId", resumed.turnId),
				)
				.collect(),
		}));
		expect(state.task).toMatchObject({
			status: "active",
			ownershipReleasedAt: null,
			activeRunIds: [resumed.runId],
		});
		expect(state.turn).toMatchObject({
			sequence: 2,
			requestedBy: "member",
		});
		expect(state.run).toMatchObject({ status: "queued" });
		expect(state.items).toEqual([
			expect.objectContaining({
				kind: "member_message",
				body: "Try the task again.",
			}),
		]);
	});

	it("retries a failed task with a new run on the same unchanged turn", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		await fixture.base.mutation(api.agent.runtime.failRun, {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
			message: "The provider request failed.",
		});
		const before = await fixture.base.run(async (ctx) => ({
			turns: await ctx.db
				.query("agentTurns")
				.withIndex("by_task_id_and_sequence", (index) =>
					index.eq("taskId", claim.taskId),
				)
				.collect(),
			items: await ctx.db
				.query("agentItems")
				.withIndex("by_turn_id_and_sequence", (index) =>
					index.eq("turnId", claim.turnId),
				)
				.collect(),
		}));

		const retry = await fixture.actor.mutation(api.agent.tasks.retry, {
			taskId: claim.taskId,
		});
		const after = await fixture.base.run(async (ctx) => ({
			task: await ctx.db.get(claim.taskId),
			run: await ctx.db.get(retry.runId),
			turns: await ctx.db
				.query("agentTurns")
				.withIndex("by_task_id_and_sequence", (index) =>
					index.eq("taskId", claim.taskId),
				)
				.collect(),
			items: await ctx.db
				.query("agentItems")
				.withIndex("by_turn_id_and_sequence", (index) =>
					index.eq("turnId", claim.turnId),
				)
				.collect(),
		}));

		expect(retry.turnId).toBe(claim.turnId);
		expect(after.task).toMatchObject({
			status: "active",
			ownershipReleasedAt: null,
			activeRunIds: [retry.runId],
		});
		expect(after.run).toMatchObject({
			turnId: claim.turnId,
			status: "queued",
		});
		expect(after.turns).toEqual(before.turns);
		expect(after.items).toEqual(before.items);
	});

	it.each([
		{
			terminalStatus: "completed",
			update: {
				status: "completed",
				result: "The original request is complete.",
			} as const,
		},
		{
			terminalStatus: "unable_to_continue",
			update: {
				status: "unable_to_continue",
				result: "The original request needs more information.",
			} as const,
		},
	])("starts a new member turn for a $terminalStatus task", async ({
		update,
	}) => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		await finishWithTaskStatus(fixture, claim, update);

		const continuation = await fixture.actor.mutation(
			api.agent.tasks.sendMessage,
			{
				taskId: claim.taskId,
				input: "Continue with this new instruction.",
			},
		);

		const state = await fixture.base.run(async (ctx) => ({
			task: await ctx.db.get(claim.taskId),
			turn: await ctx.db.get(continuation.turnId),
			run: await ctx.db.get(continuation.runId),
			items: await ctx.db
				.query("agentItems")
				.withIndex("by_turn_id_and_sequence", (index) =>
					index.eq("turnId", continuation.turnId),
				)
				.collect(),
		}));
		expect(continuation.kind).toBe("message");
		expect(state.task).toMatchObject({
			status: "active",
			ownershipReleasedAt: null,
			activeRunIds: [continuation.runId],
		});
		expect(state.task).not.toHaveProperty("result");
		expect(state.turn).toMatchObject({
			sequence: 2,
			requestedBy: "member",
		});
		expect(state.run).toMatchObject({ status: "queued" });
		expect(state.items).toEqual([
			expect.objectContaining({
				kind: "member_message",
				body: "Continue with this new instruction.",
			}),
		]);
	});

	it("does not retry a failed task after another task takes its case", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		await fixture.base.mutation(api.agent.runtime.failRun, {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
			message: "The provider request failed.",
		});
		await fixture.actor.mutation(api.agent.tasks.delegateCase, {
			caseId: fixture.caseId,
			input: "A replacement delegation.",
		});

		await expect(
			fixture.actor.mutation(api.agent.tasks.retry, {
				taskId: claim.taskId,
			}),
		).rejects.toThrow("another active agent task");
	});

	it.each([
		"completed",
		"unable_to_continue",
		"failed",
		"cancelled",
	] as const)("releases ownership and ends every pending run when a task becomes %s", async (terminalStatus) => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		await fixture.base.run(async (ctx) => {
			const queuedRunId = await ctx.db.insert("agentRuns", {
				turnId: claim.turnId,
				status: "queued",
				requestedAt: Date.now() + 1,
				attemptCount: 0,
				leaseGeneration: 0,
			});
			const runningRunId = await ctx.db.insert("agentRuns", {
				turnId: claim.turnId,
				status: "running",
				requestedAt: Date.now() + 2,
				attemptCount: 1,
				leaseGeneration: 1,
				claimToken: crypto.randomUUID(),
				claimedAt: Date.now(),
				leaseExpiresAt: Date.now() + 60_000,
				startedAt: Date.now(),
			});
			const task = await ctx.db.get(claim.taskId);
			if (!task) throw new Error("Expected task");
			await ctx.db.patch(task._id, {
				activeRunIds: [queuedRunId, runningRunId, claim.runId],
			});
		});

		if (terminalStatus === "completed") {
			await finishWithTaskStatus(fixture, claim, {
				status: "completed",
				result: "Completed with a verified result.",
			});
		} else if (terminalStatus === "unable_to_continue") {
			await finishWithTaskStatus(fixture, claim, {
				status: "unable_to_continue",
				result: "No authorized route remains.",
			});
		} else if (terminalStatus === "failed") {
			await fixture.base.mutation(api.agent.runtime.failRun, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				message: "The execution boundary failed safely.",
			});
		} else {
			await fixture.actor.mutation(api.agent.tasks.takeOverCase, {
				caseId: fixture.caseId,
				reason: "A member took over.",
			});
		}

		const state = await fixture.base.run(async (ctx) => ({
			task: await ctx.db.get(claim.taskId),
			runs: await ctx.db
				.query("agentRuns")
				.withIndex("by_turn_id_and_requested_at", (index) =>
					index.eq("turnId", claim.turnId),
				)
				.collect(),
			events: await ctx.db
				.query("caseEvents")
				.withIndex("by_case_id_and_occurred_at", (index) =>
					index.eq("caseId", fixture.caseId),
				)
				.collect(),
		}));
		expect(state.task).toMatchObject({
			status: terminalStatus,
			ownershipReleasedAt: expect.any(Number),
			...(terminalStatus === "unable_to_continue"
				? { result: "No authorized route remains." }
				: {}),
		});
		expect(
			state.runs.filter(
				(run) => run.status === "queued" || run.status === "running",
			),
		).toEqual([]);
		expect(
			state.events.filter(
				(event) =>
					"type" in event &&
					event.type === "agent_note" &&
					event.agentTaskId === claim.taskId,
			),
		).toHaveLength(0);
		await expect(
			fixture.actor.mutation(api.case.mutations.addEvent, {
				caseId: fixture.caseId,
				body: `Human write after ${terminalStatus}.`,
			}),
		).resolves.toBeTypeOf("string");
	});
});
