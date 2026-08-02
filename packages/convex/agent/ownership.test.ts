import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import {
	createFixture,
	delegateAndClaim,
	finishWithTaskStatus,
	RUNTIME_SECRET,
	startTool,
} from "./testSupport.test-helper";

describe("agent ownership and projections", () => {
	it("creates a normalized manual delegation and one durable case lock", async () => {
		const fixture = await createFixture();
		const delegation = await fixture.actor.mutation(
			api.agent.tasks.delegateCase,
			{
				caseId: fixture.caseId,
				input: "  Resolve this case.  ",
			},
		);

		const state = await fixture.base.run(async (ctx) => ({
			task: await ctx.db.get(delegation.taskId),
			turn: await ctx.db.get(delegation.turnId),
			run: await ctx.db.get(delegation.runId),
			items: await ctx.db
				.query("agentItems")
				.withIndex("by_turn_id_and_sequence", (index) =>
					index.eq("turnId", delegation.turnId),
				)
				.collect(),
		}));
		expect(state.task).toMatchObject({
			anchorCaseId: fixture.caseId,
			agentKey: "agent-v1",
			status: "active",
			requestedBy: "member",
			requestedByMemberId: fixture.memberId,
			ownershipReleasedAt: null,
		});
		expect(state.turn).toMatchObject({
			taskId: delegation.taskId,
			sequence: 1,
			requestedBy: "member",
		});
		expect(state.run).toMatchObject({
			turnId: delegation.turnId,
			status: "queued",
			attemptCount: 0,
			leaseFailureCount: 0,
			leaseGeneration: 0,
		});
		expect(state.items).toMatchObject([
			{
				kind: "member_message",
				sequence: 1,
				body: "Resolve this case.",
			},
		]);

		await expect(
			fixture.actor.mutation(api.agent.tasks.delegateCase, {
				caseId: fixture.caseId,
				input: "Create an overlapping task.",
			}),
		).rejects.toThrow("already has an active agent task");
		await expect(
			fixture.otherActor.mutation(api.agent.tasks.delegateCase, {
				caseId: fixture.caseId,
				input: "Cross organization delegation.",
			}),
		).rejects.toThrow("case could not be found");
		await expect(
			fixture.base.mutation(api.agent.runtime.claimNextRun, {
				runtimeSecret: RUNTIME_SECRET,
				claimToken: "predictable",
				leaseDurationMs: 60_000,
			}),
		).rejects.toThrow("at least 32 characters");
		expect(
			await fixture.base.mutation(api.agent.runtime.claimNextRun, {
				runtimeSecret: RUNTIME_SECRET,
				claimToken: crypto.randomUUID(),
				leaseDurationMs: 60_000,
			}),
		).toMatchObject({
			taskId: delegation.taskId,
			anchorCaseId: fixture.caseId,
		});
	});

	it("projects the current run and latest activity through case and email details", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		await fixture.base.mutation(api.agent.runtime.updateActivity, {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
			title: "Inspecting the case",
		});
		await fixture.base.mutation(api.agent.runtime.updateActivity, {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
			title: "Verifying the latest evidence",
			detail: "Checking the linked email before deciding.",
		});

		const expectedSummary = {
			taskId: claim.taskId,
			agentKey: "agent-v1",
			status: "active",
			runStatus: "running",
			activity: {
				title: "Verifying the latest evidence",
				detail: "Checking the linked email before deciding.",
			},
		};
		const [caseDetail, threadDetail] = await Promise.all([
			fixture.actor.query(api.case.reader.get, { caseId: fixture.caseId }),
			fixture.actor.query(api.email.reader.getThread, {
				threadId: fixture.linkedThreadId,
			}),
		]);
		expect(caseDetail?.activeAgentTask).toEqual(expectedSummary);
		expect(threadDetail?.activeCase?.activeAgentTask).toEqual(expectedSummary);
	});

	it("projects waiting ownership without run or transcript data", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		await finishWithTaskStatus(fixture, claim, {
			status: "waiting",
			reason: "Waiting for the customer response.",
		});

		expect(
			(
				await fixture.actor.query(api.case.reader.get, {
					caseId: fixture.caseId,
				})
			)?.activeAgentTask,
		).toEqual({
			taskId: claim.taskId,
			agentKey: "agent-v1",
			status: "waiting",
			reason: "Waiting for the customer response.",
		});
	});

	it("counts only pending approvals from the task's bounded active approval ids", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		for (const approvalId of [
			"projection-approval-a",
			"projection-approval-b",
		]) {
			const toolCallId = `tool-${approvalId}`;
			await startTool(fixture, claim, toolCallId, "update_case");
			await fixture.base.mutation(api.agent.runtime.recordToolApprovalRequest, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				toolCallId,
				approvalId,
				request: `Approve ${approvalId}?`,
			});
		}
		await fixture.base.mutation(api.agent.runtime.finishRun, {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
		});
		expect(
			await fixture.actor.mutation(api.agent.tasks.answerApprovals, {
				taskId: claim.taskId,
				answers: [{ approvalId: "projection-approval-a", approved: true }],
			}),
		).toEqual({ resumed: false });

		expect(
			(
				await fixture.actor.query(api.case.reader.get, {
					caseId: fixture.caseId,
				})
			)?.activeAgentTask,
		).toEqual({
			taskId: claim.taskId,
			agentKey: "agent-v1",
			status: "waiting_for_approval",
			pendingApprovalCount: 1,
		});
	});

	it("rejects cross-task run, activity, and approval links in the case projection", async () => {
		const fixture = await createFixture();
		const owner = await fixture.actor.mutation(api.agent.tasks.delegateCase, {
			caseId: fixture.caseId,
			input: "Own the projected case.",
		});
		const foreign = await fixture.actor.mutation(api.agent.tasks.delegateCase, {
			caseId: fixture.secondCaseId,
			input: "Hold foreign task data.",
		});
		const foreignApprovalId = await fixture.base.run(async (ctx) => {
			await ctx.db.insert("agentItems", {
				turnId: foreign.turnId,
				sequence: 2,
				createdAt: Date.now(),
				kind: "activity",
				runId: owner.runId,
				title: "Foreign activity text",
			});
			return await ctx.db.insert("agentItems", {
				turnId: foreign.turnId,
				sequence: 3,
				createdAt: Date.now(),
				kind: "approval",
				approvalKind: "task",
				approvalId: "foreign-projection-approval",
				request: "Foreign approval text",
				status: "pending",
			});
		});

		await expect(
			fixture.actor.query(api.case.reader.get, { caseId: fixture.caseId }),
		).rejects.toThrow("activity index returned an invalid item");

		await fixture.base.run(async (ctx) => {
			await ctx.db.patch(owner.taskId, { activeRunIds: [foreign.runId] });
		});
		await expect(
			fixture.actor.query(api.case.reader.get, { caseId: fixture.caseId }),
		).rejects.toThrow("run belongs to another task");

		await fixture.base.run(async (ctx) => {
			await ctx.db.patch(owner.taskId, {
				status: "waiting_for_approval",
				activeRunIds: [],
				activeApprovalIds: [foreignApprovalId],
			});
		});
		await expect(
			fixture.actor.query(api.case.reader.get, { caseId: fixture.caseId }),
		).rejects.toThrow("approval belongs to another task");
	});

	it("rejects case events linked to an agent task from another organization", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		const foreign = await fixture.otherActor.mutation(
			api.agent.tasks.delegateCase,
			{
				caseId: fixture.otherCaseId,
				input: "A foreign task must not provide local event provenance.",
			},
		);
		await fixture.base.run(async (ctx) => {
			await ctx.db.insert("caseEvents", {
				caseId: fixture.caseId,
				type: "agent_note",
				body: "Cross-organization agent provenance",
				agentTaskId: foreign.taskId,
				occurredAt: 500,
				createdAt: 500,
				createdByMemberId: null,
			});
		});
		await expect(
			fixture.actor.query(api.case.reader.get, { caseId: fixture.caseId }),
		).rejects.toThrow("another organization");
		await expect(
			fixture.base.mutation(api.agent.tools.readCase, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				caseId: fixture.caseId,
			}),
		).rejects.toThrow("another organization");
	});

	it("fails closed before terminalizing cross-task run or approval ledgers", async () => {
		const fixture = await createFixture();
		const owner = await fixture.actor.mutation(api.agent.tasks.delegateCase, {
			caseId: fixture.caseId,
			input: "Keep ownership until the ledger is verified.",
		});
		const foreign = await fixture.actor.mutation(api.agent.tasks.delegateCase, {
			caseId: fixture.secondCaseId,
			input: "A separate task must remain untouched.",
		});
		await fixture.base.run(async (ctx) => {
			await ctx.db.patch(owner.taskId, { activeRunIds: [foreign.runId] });
		});
		await expect(
			fixture.actor.mutation(api.agent.tasks.takeOverCase, {
				caseId: fixture.caseId,
			}),
		).rejects.toThrow("run belongs to another task");
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(foreign.runId)),
		).toMatchObject({ status: "queued" });

		const foreignApprovalId = await fixture.base.run(async (ctx) => {
			await ctx.db.patch(owner.taskId, { activeRunIds: [owner.runId] });
			const toolItemId = await ctx.db.insert("agentItems", {
				turnId: foreign.turnId,
				sequence: 2,
				createdAt: 2,
				kind: "tool",
				runId: foreign.runId,
				toolCallId: "foreign-tool",
				toolName: "foreign_tool",
				inputJson: "{}",
				summary: "Foreign tool",
				status: "approval_required",
			});
			const approvalId = await ctx.db.insert("agentItems", {
				turnId: foreign.turnId,
				sequence: 3,
				createdAt: 3,
				kind: "approval",
				approvalKind: "tool",
				toolItemId,
				approvalId: "foreign-approval",
				request: "Approve foreign work?",
				status: "pending",
			});
			await ctx.db.patch(owner.taskId, {
				activeApprovalIds: [approvalId],
			});
			return approvalId;
		});
		await expect(
			fixture.actor.mutation(api.agent.tasks.takeOverCase, {
				caseId: fixture.caseId,
			}),
		).rejects.toThrow("approval belongs to another task");
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(foreignApprovalId)),
		).toMatchObject({ status: "pending" });
		const invalidToolApprovalId = await fixture.base.run(async (ctx) => {
			const foreignApproval = await ctx.db.get(foreignApprovalId);
			if (
				!foreignApproval ||
				foreignApproval.kind !== "approval" ||
				foreignApproval.approvalKind !== "tool"
			) {
				throw new Error("Expected a foreign tool approval");
			}
			const approvalId = await ctx.db.insert("agentItems", {
				turnId: owner.turnId,
				sequence: 2,
				createdAt: 2,
				kind: "approval",
				approvalKind: "tool",
				toolItemId: foreignApproval.toolItemId,
				approvalId: "invalid-tool-approval",
				request: "Approve a cross-turn tool?",
				status: "pending",
			});
			await ctx.db.patch(owner.taskId, { activeApprovalIds: [approvalId] });
			return approvalId;
		});
		await expect(
			fixture.actor.mutation(api.agent.tasks.takeOverCase, {
				caseId: fixture.caseId,
			}),
		).rejects.toThrow("invalid tool item");
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(invalidToolApprovalId)),
		).toMatchObject({ status: "pending" });
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(owner.taskId)),
		).toMatchObject({ status: "active", ownershipReleasedAt: null });
	});

	it("rejects a tool item cross-linked from the claimed run to another turn", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		const foreign = await fixture.actor.mutation(api.agent.tasks.delegateCase, {
			caseId: fixture.secondCaseId,
			input: "Provide a foreign turn.",
		});
		const itemId = await fixture.base.run(async (ctx) => {
			return await ctx.db.insert("agentItems", {
				turnId: foreign.turnId,
				sequence: 2,
				createdAt: 2,
				kind: "tool",
				runId: claim.runId,
				toolCallId: "cross-turn-tool",
				toolName: "update_case",
				inputJson: "{}",
				summary: "Cross-linked tool",
				status: "started",
			});
		});
		await expect(
			fixture.base.mutation(api.agent.runtime.recordToolFinished, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				toolCallId: "cross-turn-tool",
				result: { status: "completed", outputJson: "null" },
			}),
		).rejects.toThrow("Tool item not found");
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(itemId)),
		).toMatchObject({ status: "started", turnId: foreign.turnId });
	});

	it("fails before writes when a persisted active-run index exceeds its bound", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		await fixture.base.run(async (ctx) => {
			const runIds = [claim.runId];
			for (let index = 0; index < 20; index += 1) {
				runIds.push(
					await ctx.db.insert("agentRuns", {
						turnId: claim.turnId,
						status: "queued",
						requestedAt: index,
						attemptCount: 0,
						leaseFailureCount: 0,
						leaseGeneration: 0,
					}),
				);
			}
			await ctx.db.patch(claim.taskId, { activeRunIds: runIds });
		});
		await expect(
			fixture.actor.mutation(api.agent.tasks.takeOverCase, {
				caseId: fixture.caseId,
			}),
		).rejects.toThrow("invalid run ledger");
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(claim.runId)),
		).toMatchObject({ status: "running" });
	});

	it.each([
		"completed",
		"unable_to_continue",
		"failed",
		"cancelled",
	] as const)("omits released %s tasks from the case projection", async (status) => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		if (status === "completed") {
			await finishWithTaskStatus(fixture, claim, {
				status: "completed",
				result: "Finished the projected work.",
			});
		} else if (status === "unable_to_continue") {
			await finishWithTaskStatus(fixture, claim, {
				status: "unable_to_continue",
				result: "No safe path remains.",
			});
		} else if (status === "failed") {
			await fixture.base.mutation(api.agent.runtime.failRun, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				message: "The projected run failed.",
			});
		} else {
			await fixture.actor.mutation(api.agent.tasks.takeOverCase, {
				caseId: fixture.caseId,
				reason: "A member owns the next step.",
			});
		}

		expect(
			(
				await fixture.actor.query(api.case.reader.get, {
					caseId: fixture.caseId,
				})
			)?.activeAgentTask,
		).toBeNull();
	});

	it("preserves write barriers, delegation uniqueness, and explicit takeover after ownership extraction", async () => {
		const fixture = await createFixture();
		const first = await fixture.actor.mutation(api.agent.tasks.delegateCase, {
			caseId: fixture.caseId,
			input: "Own this case until explicit takeover.",
		});
		await expect(
			fixture.actor.mutation(api.case.mutations.addEvent, {
				caseId: fixture.caseId,
				body: "Blocked while the agent owns the case.",
			}),
		).rejects.toThrow("Agent is working on this case");
		await expect(
			fixture.actor.mutation(api.agent.tasks.delegateCase, {
				caseId: fixture.caseId,
				input: "Do not create a duplicate owner.",
			}),
		).rejects.toThrow("already has an active agent task");

		await fixture.actor.mutation(api.agent.tasks.takeOverCase, {
			caseId: fixture.caseId,
			reason: "A member is taking responsibility.",
		});
		await expect(
			fixture.actor.mutation(api.case.mutations.addEvent, {
				caseId: fixture.caseId,
				body: "Allowed after takeover.",
			}),
		).resolves.toBeTypeOf("string");
		const second = await fixture.actor.mutation(api.agent.tasks.delegateCase, {
			caseId: fixture.caseId,
			input: "Start a new owner after takeover.",
		});
		expect(second.taskId).not.toBe(first.taskId);
		const caseDetail = await fixture.actor.query(api.case.reader.get, {
			caseId: fixture.caseId,
		});
		expect(caseDetail?.activeAgentTask).toEqual({
			taskId: second.taskId,
			agentKey: "agent-v1",
			status: "active",
			runStatus: "queued",
			activity: null,
		});
		expect(caseDetail?.agentTasks).toEqual([
			expect.objectContaining({
				taskId: second.taskId,
				status: "active",
			}),
			expect.objectContaining({
				taskId: first.taskId,
				status: "cancelled",
			}),
		]);
	});
});
