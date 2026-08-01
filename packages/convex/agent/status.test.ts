import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import {
	createFixture,
	delegateAndClaim,
	RUNTIME_SECRET,
	startTool,
} from "./testSupport.test-helper";

describe("agent status and write barriers", () => {
	it("relinquishes three graceful shutdowns without spending the lease-loss budget and recovers staged status", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		const update = {
			status: "completed" as const,
			result: "Recovered after repeated orderly worker replacement.",
		};
		let claimToken = claim.claimToken;
		for (let cycle = 1; cycle <= 3; cycle += 1) {
			if (cycle === 3) {
				await startTool(
					fixture,
					{ runId: claim.runId, claimToken },
					"shutdown-status",
					"update_task_status",
				);
				await fixture.base.mutation(api.agent.runtime.stageTaskStatus, {
					runtimeSecret: RUNTIME_SECRET,
					runId: claim.runId,
					claimToken,
					toolCallId: "shutdown-status",
					update,
				});
			}
			await fixture.base.mutation(api.agent.runtime.relinquishRun, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken,
			});
			const relinquished = await fixture.base.run(async (ctx) => ({
				run: await ctx.db.get(claim.runId),
				task: await ctx.db.get(claim.taskId),
			}));
			expect(relinquished.run).toMatchObject({
				status: "queued",
				attemptCount: cycle,
				leaseFailureCount: 0,
			});
			expect(relinquished.task).toMatchObject({
				status: "active",
				ownershipReleasedAt: null,
				activeRunIds: [claim.runId],
			});

			claimToken = crypto.randomUUID();
			const reclaimed = await fixture.base.mutation(
				api.agent.runtime.claimNextRun,
				{
					runtimeSecret: RUNTIME_SECRET,
					claimToken,
					leaseDurationMs: 60_000,
				},
			);
			expect(reclaimed?.runId).toBe(claim.runId);
		}

		const transcript = await fixture.base.mutation(
			api.agent.runtime.getTranscript,
			{
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken,
			},
		);
		expect(transcript.selectedStatusItemId).toBeTypeOf("string");
		await fixture.base.mutation(api.agent.runtime.finishRun, {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken,
		});
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(claim.taskId)),
		).toMatchObject({
			status: "completed",
			result: update.result,
			ownershipReleasedAt: expect.any(Number),
		});
	});

	it("preserves a durable task status when its caller observes a later failure", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		await startTool(fixture, claim, "durable-status", "update_task_status");
		const update = {
			status: "completed" as const,
			result: "Recovered the selected result exactly once.",
		};
		expect(
			await fixture.base.mutation(api.agent.runtime.stageTaskStatus, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				toolCallId: "durable-status",
				update,
			}),
		).toEqual(update);
		expect(
			await fixture.base.mutation(api.agent.runtime.recordToolStarted, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				toolCallId: "durable-status",
				toolName: "update_task_status",
				inputJson: "{}",
				summary: "Testing update_task_status",
			}),
		).toBeTypeOf("string");
		await expect(
			fixture.base.mutation(api.agent.runtime.recordToolStarted, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				toolCallId: "late-business-tool",
				toolName: "read_case",
				inputJson: "{}",
				summary: "Late business tool",
			}),
		).rejects.toThrow("can only be finalized");
		await expect(
			fixture.base.mutation(api.agent.runtime.updateActivity, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				title: "This must not be written",
			}),
		).rejects.toThrow("can only be finalized");
		await expect(
			fixture.base.mutation(api.agent.runtime.startAgentMessage, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				body: "Late text",
			}),
		).rejects.toThrow("can only be finalized");
		await expect(
			fixture.base.mutation(api.agent.tools.search, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				searchQuery: "case",
				filter: { kind: "cases" },
			}),
		).rejects.toThrow("can only be finalized");

		expect(
			await fixture.base.mutation(api.agent.runtime.failRun, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				message: "A stale caller believed the provider failed.",
			}),
		).toBe("finalized_selected_status");
		const state = await fixture.base.run(async (ctx) => ({
			task: await ctx.db.get(claim.taskId),
			statusItems: await ctx.db
				.query("agentItems")
				.withIndex("by_run_id_and_tool_call_id", (index) =>
					index.eq("runId", claim.runId).eq("toolCallId", "durable-status"),
				)
				.collect(),
		}));
		expect(state.task).toMatchObject({
			status: "completed",
			result: update.result,
			ownershipReleasedAt: expect.any(Number),
		});
		expect(state.statusItems).toHaveLength(1);
		expect(state.statusItems[0]).toMatchObject({
			status: "completed",
			taskStatusUpdate: update,
		});
	});

	it("finalizes a durable task status when its worker lease expires", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		await startTool(
			fixture,
			claim,
			"lease-finalized-status",
			"update_task_status",
		);
		const update = {
			status: "completed" as const,
			result: "The durable result survived its worker lease.",
		};
		await fixture.base.mutation(api.agent.runtime.stageTaskStatus, {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
			toolCallId: "lease-finalized-status",
			update,
		});
		await fixture.base.run(async (ctx) => {
			await ctx.db.patch(claim.runId, { leaseExpiresAt: 0 });
		});

		await fixture.base.mutation(internal.agent.leases.requeueExpiredRun, {
			runId: claim.runId,
			leaseGeneration: 1,
		});

		const state = await fixture.base.run(async (ctx) => ({
			run: await ctx.db.get(claim.runId),
			task: await ctx.db.get(claim.taskId),
		}));
		expect(state.run).toMatchObject({
			status: "completed",
			leaseFailureCount: 0,
		});
		expect(state.task).toMatchObject({
			status: "completed",
			result: update.result,
			ownershipReleasedAt: expect.any(Number),
		});
		expect(
			await fixture.base.query(api.agent.runtime.observeNextQueuedRun, {
				runtimeSecret: RUNTIME_SECRET,
			}),
		).toBeNull();
	});

	it("rejects a selected status item cross-linked from another turn", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		const foreign = await fixture.actor.mutation(api.agent.tasks.delegateCase, {
			caseId: fixture.secondCaseId,
			input: "Provide a foreign turn for the corruption check.",
		});
		await fixture.base.run(async (ctx) => {
			const selectedStatusItemId = await ctx.db.insert("agentItems", {
				turnId: foreign.turnId,
				sequence: 2,
				createdAt: 2,
				kind: "tool",
				runId: claim.runId,
				toolCallId: "cross-turn-selected-status",
				toolName: "update_task_status",
				inputJson: "{}",
				summary: "Cross-turn status",
				status: "completed",
				taskStatusUpdate: {
					status: "completed",
					result: "This foreign item must not finalize the task.",
				},
			});
			await ctx.db.patch(claim.runId, { selectedStatusItemId });
		});
		await expect(
			fixture.base.mutation(api.agent.runtime.failRun, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				message: "The caller observed an error.",
			}),
		).rejects.toThrow("Selected task status item is invalid");
		const state = await fixture.base.run(async (ctx) => ({
			run: await ctx.db.get(claim.runId),
			task: await ctx.db.get(claim.taskId),
		}));
		expect(state.run).toMatchObject({ status: "running" });
		expect(state.task).toMatchObject({
			status: "active",
			ownershipReleasedAt: null,
		});
	});

	it("atomically selects one status when same-step status tools race", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		const selections = [
			{
				toolCallId: "concurrent-completed",
				update: {
					status: "completed" as const,
					result: "The completed status won atomically.",
				},
			},
			{
				toolCallId: "concurrent-unable",
				update: {
					status: "unable_to_continue" as const,
					result: "The unable status won atomically.",
				},
			},
		];
		for (const selection of selections) {
			await startTool(
				fixture,
				claim,
				selection.toolCallId,
				"update_task_status",
			);
		}

		const results = await Promise.allSettled(
			selections.map(async ({ toolCallId, update }) =>
				fixture.base.mutation(api.agent.runtime.stageTaskStatus, {
					runtimeSecret: RUNTIME_SECRET,
					runId: claim.runId,
					claimToken: claim.claimToken,
					toolCallId,
					update,
				}),
			),
		);
		expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
			1,
		);
		expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
			1,
		);
		const winnerIndex = results.findIndex(
			({ status }) => status === "fulfilled",
		);
		const winner = selections[winnerIndex];
		if (!winner) throw new Error("Expected one durable status winner");

		await Promise.all([
			fixture.base.mutation(api.agent.runtime.stageTaskStatus, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				...winner,
			}),
			fixture.base.mutation(api.agent.runtime.stageTaskStatus, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				...winner,
			}),
		]);
		const loser = selections[winnerIndex === 0 ? 1 : 0];
		if (!loser) throw new Error("Expected one rejected status selection");
		await expect(
			fixture.base.mutation(api.agent.runtime.stageTaskStatus, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				toolCallId: loser.toolCallId,
				update: winner.update,
			}),
		).rejects.toThrow("Another tool call already selected");

		const staged = await fixture.base.run(async (ctx) => ({
			run: await ctx.db.get(claim.runId),
			task: await ctx.db.get(claim.taskId),
			items: await ctx.db
				.query("agentItems")
				.withIndex("by_turn_id_and_sequence", (index) =>
					index.eq("turnId", claim.turnId),
				)
				.collect(),
		}));
		expect(staged.task).toMatchObject({ status: "active" });
		expect(staged.run).toMatchObject({
			status: "running",
			selectedStatusItemId: expect.any(String),
		});
		expect(
			staged.items.filter(
				(item) =>
					item.kind === "tool" &&
					item.toolName === "update_task_status" &&
					item.status === "completed",
			),
		).toHaveLength(1);

		await fixture.base.mutation(api.agent.runtime.finishRun, {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
		});
		const finalized = await fixture.base.run(async (ctx) => ({
			task: await ctx.db.get(claim.taskId),
			completionNotes: (
				await ctx.db
					.query("caseEvents")
					.withIndex("by_case_id_and_occurred_at", (index) =>
						index.eq("caseId", fixture.caseId),
					)
					.collect()
			).filter(
				(event) =>
					"type" in event &&
					event.type === "agent_note" &&
					event.agentTaskId === claim.taskId,
			),
		}));
		expect(finalized.task).toMatchObject({
			status: winner.update.status,
			result: winner.update.result,
			ownershipReleasedAt: expect.any(Number),
		});
		expect(finalized.completionNotes).toHaveLength(0);
	});

	it("rejects oversized takeover reasons without changing ownership", async () => {
		const fixture = await createFixture();
		const delegation = await fixture.actor.mutation(
			api.agent.tasks.delegateCase,
			{
				caseId: fixture.caseId,
				input: "Keep this task active.",
			},
		);

		await expect(
			fixture.actor.mutation(api.agent.tasks.takeOverCase, {
				caseId: fixture.caseId,
				reason: "x".repeat(501),
			}),
		).rejects.toThrow("no more than 500 characters");

		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(delegation.taskId)),
		).toMatchObject({
			status: "active",
			ownershipReleasedAt: null,
		});
	});

	it("blocks every human case write surface until explicit takeover", async () => {
		const fixture = await createFixture();
		await fixture.actor.mutation(api.case.mutations.update, {
			caseId: fixture.secondCaseId,
			title: "Unlocked human update",
			description: "",
			ownerMemberId: null,
			dueAt: null,
			status: "open",
		});
		const draft = await fixture.actor.mutation(api.email.outbound.saveDraft, {
			threadId: fixture.linkedThreadId,
			body: "A reply that would change the locked case timeline.",
		});
		const delegation = await fixture.actor.mutation(
			api.agent.tasks.delegateCase,
			{
				caseId: fixture.caseId,
				input: "Own this case while work is in progress.",
			},
		);
		const lockedWrites = [
			() =>
				fixture.actor.mutation(api.email.outbound.saveDraft, {
					threadId: fixture.linkedThreadId,
					body: "A human draft written while the case is locked.",
					expectedRevision: draft.revision,
				}),
			() =>
				fixture.actor.mutation(api.case.mutations.update, {
					caseId: fixture.caseId,
					title: "Conflicting human update",
					description: "",
					ownerMemberId: null,
					dueAt: null,
					status: "open",
				}),
			() =>
				fixture.actor.mutation(api.case.mutations.addEvent, {
					caseId: fixture.caseId,
					body: "Conflicting note",
				}),
			() =>
				fixture.actor.mutation(api.case.mutations.addContactRelation, {
					caseId: fixture.caseId,
					contactId: fixture.contactId,
				}),
			() =>
				fixture.actor.mutation(api.case.mutations.removeContactRelation, {
					relationId: fixture.contactRelationId,
				}),
			() =>
				fixture.actor.mutation(api.case.mutations.addEntityRelation, {
					caseId: fixture.caseId,
					entityId: fixture.entityId,
				}),
			() =>
				fixture.actor.mutation(api.case.mutations.removeEntityRelation, {
					relationId: fixture.entityRelationId,
				}),
			() =>
				fixture.actor.mutation(api.case.mutations.addCaseRelation, {
					caseId: fixture.caseId,
					relatedCaseId: fixture.secondCaseId,
				}),
			() =>
				fixture.actor.mutation(api.case.mutations.addCaseRelation, {
					caseId: fixture.secondCaseId,
					relatedCaseId: fixture.caseId,
				}),
			() =>
				fixture.actor.mutation(api.case.mutations.removeCaseRelation, {
					relationId: fixture.caseRelationId,
				}),
			() =>
				fixture.actor.mutation(api.case.mutations.linkEmailThread, {
					caseId: fixture.caseId,
					threadId: fixture.unlinkedThreadId,
				}),
			() =>
				fixture.actor.mutation(api.case.mutations.unlinkEmailThread, {
					relationId: fixture.emailRelationId,
				}),
			() =>
				fixture.actor.mutation(api.case.mutations.create, {
					title: "Related conflicting case",
					description: "",
					ownerMemberId: null,
					dueAt: null,
					initialEventBody: "",
					contactIds: [],
					entityIds: [],
					relatedCaseIds: [fixture.caseId],
				}),
			() =>
				fixture.actor.mutation(api.email.outbound.queueReply, {
					threadId: fixture.linkedThreadId,
					draftRevision: draft.revision,
					clientRequestId: "locked-agent-case",
				}),
			() =>
				fixture.actor.mutation(api.email.reader.setUnread, {
					threadId: fixture.linkedThreadId,
					isUnread: true,
				}),
		];
		for (const write of lockedWrites) {
			await expect(write()).rejects.toThrow("Agent is working on this case");
		}

		await fixture.actor.mutation(api.agent.tasks.takeOverCase, {
			caseId: fixture.caseId,
			reason: "A person is taking responsibility.",
		});
		await expect(
			fixture.actor.mutation(api.case.mutations.addEvent, {
				caseId: fixture.caseId,
				body: "The human can now update the case.",
			}),
		).resolves.toBeTypeOf("string");
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(delegation.taskId)),
		).toMatchObject({
			status: "cancelled",
			ownershipReleasedAt: expect.any(Number),
		});
	});

	it("allows an agent to change only the case owned by its current task", async () => {
		const fixture = await createFixture();
		const firstDelegation = await fixture.actor.mutation(
			api.agent.tasks.delegateCase,
			{
				caseId: fixture.caseId,
				input: "Work on the first case.",
			},
		);
		await fixture.actor.mutation(api.agent.tasks.delegateCase, {
			caseId: fixture.secondCaseId,
			input: "A different task owns the second case.",
		});
		const claimToken = crypto.randomUUID();
		const claim = await fixture.base.mutation(api.agent.runtime.claimNextRun, {
			runtimeSecret: RUNTIME_SECRET,
			claimToken,
			leaseDurationMs: 60_000,
		});
		expect(claim?.runId).toBe(firstDelegation.runId);
		if (!claim) throw new Error("Expected first task claim");

		await startTool(
			fixture,
			{ runId: claim.runId, claimToken },
			"owned-update",
			"update_case",
		);
		const updateArgs = {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken,
			toolCallId: "owned-update",
			caseId: fixture.caseId,
			title: "Owned agent update",
		};
		await expect(
			fixture.base.mutation(api.agent.tools.updateCase, updateArgs),
		).resolves.toBe(fixture.caseId);
		await expect(
			fixture.base.mutation(api.agent.tools.updateCase, updateArgs),
		).resolves.toBe(fixture.caseId);
		await startTool(
			fixture,
			{ runId: claim.runId, claimToken },
			"cross-update",
			"update_case",
		);
		await expect(
			fixture.base.mutation(api.agent.tools.updateCase, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken,
				toolCallId: "cross-update",
				caseId: fixture.secondCaseId,
				title: "Cross-task write",
			}),
		).rejects.toThrow("does not own the case");
	});
});
