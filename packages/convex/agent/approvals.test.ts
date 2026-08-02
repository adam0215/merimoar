import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import {
	createFixture,
	delegateAndClaim,
	finishWithTaskStatus,
	RUNTIME_SECRET,
	startTool,
} from "./testSupport.test-helper";

describe("agent approvals", () => {
	it("keeps waiting ownership, requires actionable approval, and releases only on completion", async () => {
		const fixture = await createFixture();
		const firstClaim = await delegateAndClaim(fixture);
		await finishWithTaskStatus(fixture, firstClaim, {
			status: "waiting",
			reason: "Waiting for the customer reply.",
		});
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(firstClaim.taskId)),
		).toMatchObject({
			status: "waiting",
			waitingReason: "Waiting for the customer reply.",
			ownershipReleasedAt: null,
		});
		await expect(
			fixture.actor.mutation(api.case.mutations.addEvent, {
				caseId: fixture.caseId,
				body: "A human write while waiting.",
			}),
		).rejects.toThrow("Agent is working on this case");

		const resumed = await fixture.actor.mutation(api.agent.tasks.sendMessage, {
			taskId: firstClaim.taskId,
			input: "The customer replied. Continue.",
		});
		const secondToken = crypto.randomUUID();
		const secondClaim = await fixture.base.mutation(
			api.agent.runtime.claimNextRun,
			{
				runtimeSecret: RUNTIME_SECRET,
				claimToken: secondToken,
				leaseDurationMs: 60_000,
			},
		);
		expect(secondClaim?.runId).toBe(resumed.runId);
		if (!secondClaim) throw new Error("Expected resumed run");

		await finishWithTaskStatus(
			fixture,
			{ ...secondClaim, claimToken: secondToken },
			{
				status: "waiting_for_approval",
				approvalId: "approval-1",
				approvalRequest: "Approve closing CASE-AGENT?",
			},
		);
		const pendingApproval = await fixture.base.run(async (ctx) =>
			ctx.db
				.query("agentItems")
				.withIndex("by_approval_id", (index) =>
					index.eq("approvalId", "approval-1"),
				)
				.unique(),
		);
		expect(pendingApproval).toMatchObject({
			kind: "approval",
			status: "pending",
			request: "Approve closing CASE-AGENT?",
		});
		await expect(
			fixture.actor.mutation(api.case.mutations.addEvent, {
				caseId: fixture.caseId,
				body: "A human write while approval is pending.",
			}),
		).rejects.toThrow("Agent is working on this case");
		const approvalAnswer = await fixture.actor.mutation(
			api.agent.tasks.answerApprovals,
			{
				taskId: firstClaim.taskId,
				answers: [
					{
						approvalId: "approval-1",
						approved: true,
						reason: "The work is verified.",
					},
				],
			},
		);
		if (!approvalAnswer.resumed) throw new Error("Expected task to resume");
		const thirdToken = crypto.randomUUID();
		const thirdClaim = await fixture.base.mutation(
			api.agent.runtime.claimNextRun,
			{
				runtimeSecret: RUNTIME_SECRET,
				claimToken: thirdToken,
				leaseDurationMs: 60_000,
			},
		);
		expect(thirdClaim?.runId).toBe(approvalAnswer.runId);
		if (!thirdClaim) throw new Error("Expected approval continuation run");
		await finishWithTaskStatus(
			fixture,
			{ ...thirdClaim, claimToken: thirdToken },
			{
				status: "completed",
				result:
					"Reviewed the customer reply and closed the work because the requested correction was confirmed.",
			},
		);
		const completed = await fixture.base.run(async (ctx) => ({
			task: await ctx.db.get(firstClaim.taskId),
			events: await ctx.db
				.query("caseEvents")
				.withIndex("by_case_id_and_occurred_at", (index) =>
					index.eq("caseId", fixture.caseId),
				)
				.collect(),
		}));
		expect(completed.task).toMatchObject({
			status: "completed",
			result:
				"Reviewed the customer reply and closed the work because the requested correction was confirmed.",
		});
		expect(completed.task?.ownershipReleasedAt).toBeTypeOf("number");
		expect(
			completed.events.some(
				(event) =>
					"type" in event &&
					event.type === "agent_note" &&
					event.agentTaskId === firstClaim.taskId,
			),
		).toBe(false);
	});

	it("preserves an approval-required tool item until the approval is resolved", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		await startTool(fixture, claim, "approval-guard-tool", "update_case");
		const approvalItemId = await fixture.base.mutation(
			api.agent.runtime.recordToolApprovalRequest,
			{
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				toolCallId: "approval-guard-tool",
				approvalId: "approval-guard",
				request: "Approve the guarded update?",
			},
		);

		await expect(
			fixture.base.mutation(api.agent.runtime.recordToolFinished, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				toolCallId: "approval-guard-tool",
				result: { status: "completed", outputJson: "null" },
			}),
		).rejects.toThrow("awaiting approval cannot be completed directly");
		await expect(
			fixture.base.mutation(api.agent.runtime.recordToolApprovalRequest, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				toolCallId: "approval-guard-tool",
				approvalId: "approval-guard-duplicate",
				request: "Request the same approval twice?",
			}),
		).rejects.toThrow("Only a started tool call can request approval");

		const guardedState = await fixture.base.run(async (ctx) => ({
			approval: await ctx.db.get(approvalItemId),
			items: await ctx.db
				.query("agentItems")
				.withIndex("by_run_id_and_tool_call_id", (index) =>
					index
						.eq("runId", claim.runId)
						.eq("toolCallId", "approval-guard-tool"),
				)
				.unique(),
			task: await ctx.db.get(claim.taskId),
		}));
		expect(guardedState.approval).toMatchObject({
			kind: "approval",
			status: "pending",
		});
		expect(guardedState.items).toMatchObject({
			kind: "tool",
			status: "approval_required",
		});
		expect(guardedState.task).toMatchObject({
			status: "waiting_for_approval",
			activeApprovalIds: [approvalItemId],
		});
	});

	it("answers approvals in batches and resumes exactly once after all are resolved", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		for (const [toolCallId, approvalId] of [
			["tool-a", "approval-a"],
			["tool-b", "approval-b"],
		] as const) {
			await fixture.base.mutation(api.agent.runtime.recordToolStarted, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				toolCallId,
				toolName: "update_case",
				inputJson: "{}",
				summary: "Updating a case",
			});
			await fixture.base.mutation(api.agent.runtime.recordToolApprovalRequest, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				toolCallId,
				approvalId,
				request: `Approve ${toolCallId}?`,
			});
		}
		await fixture.base.mutation(api.agent.runtime.finishRun, {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
		});

		await expect(
			fixture.actor.mutation(api.agent.tasks.answerApprovals, {
				taskId: claim.taskId,
				answers: [
					{ approvalId: "approval-a", approved: true },
					{ approvalId: "approval-a", approved: false },
				],
			}),
		).rejects.toThrow("only be answered once");

		const partial = await fixture.actor.mutation(
			api.agent.tasks.answerApprovals,
			{
				taskId: claim.taskId,
				answers: [
					{
						approvalId: "approval-b",
						approved: true,
						reason: "The update is safe.",
					},
				],
			},
		);
		expect(partial).toEqual({ resumed: false });
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(claim.taskId)),
		).toMatchObject({
			status: "waiting_for_approval",
			ownershipReleasedAt: null,
		});
		expect(
			await fixture.base.query(api.agent.runtime.observeNextQueuedRun, {
				runtimeSecret: RUNTIME_SECRET,
			}),
		).toBeNull();

		const resumed = await fixture.actor.mutation(
			api.agent.tasks.answerApprovals,
			{
				taskId: claim.taskId,
				answers: [
					{
						approvalId: "approval-a",
						approved: false,
						reason: "Use a non-destructive alternative.",
					},
				],
			},
		);
		expect(resumed).toMatchObject({ resumed: true });
		if (!resumed.resumed) throw new Error("Expected one resumed turn");

		const state = await fixture.base.run(async (ctx) => ({
			task: await ctx.db.get(claim.taskId),
			turns: await ctx.db
				.query("agentTurns")
				.withIndex("by_task_id_and_sequence", (index) =>
					index.eq("taskId", claim.taskId),
				)
				.collect(),
			firstApproval: await ctx.db
				.query("agentItems")
				.withIndex("by_approval_id", (index) =>
					index.eq("approvalId", "approval-a"),
				)
				.unique(),
			secondApproval: await ctx.db
				.query("agentItems")
				.withIndex("by_approval_id", (index) =>
					index.eq("approvalId", "approval-b"),
				)
				.unique(),
		}));
		expect(state.task).toMatchObject({
			status: "active",
			ownershipReleasedAt: null,
		});
		expect(state.turns).toHaveLength(2);
		expect(state.firstApproval).toMatchObject({
			status: "denied",
			answerReason: "Use a non-destructive alternative.",
		});
		expect(state.secondApproval).toMatchObject({
			status: "approved",
			answerReason: "The update is safe.",
		});

		await expect(
			fixture.actor.mutation(api.agent.tasks.answerApprovals, {
				taskId: claim.taskId,
				answers: [{ approvalId: "approval-a", approved: true }],
			}),
		).rejects.toThrow("not waiting for approval");
		expect(
			await fixture.base.run(async (ctx) =>
				ctx.db
					.query("agentTurns")
					.withIndex("by_task_id_and_sequence", (index) =>
						index.eq("taskId", claim.taskId),
					)
					.collect(),
			),
		).toHaveLength(2);

		const continuationToken = crypto.randomUUID();
		const continuationClaim = await fixture.base.mutation(
			api.agent.runtime.claimNextRun,
			{
				runtimeSecret: RUNTIME_SECRET,
				claimToken: continuationToken,
				leaseDurationMs: 60_000,
			},
		);
		expect(continuationClaim?.runId).toBe(resumed.runId);
		if (!continuationClaim) throw new Error("Expected approval continuation");
		const replayTranscript = await fixture.base.mutation(
			api.agent.runtime.getTranscript,
			{
				runtimeSecret: RUNTIME_SECRET,
				runId: continuationClaim.runId,
				claimToken: continuationToken,
			},
		);
		expect(
			replayTranscript.turns
				.flatMap((turn) => turn.items)
				.filter((item) => item.kind === "approval"),
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					approvalId: "approval-a",
					continuationRunId: continuationClaim.runId,
				}),
				expect.objectContaining({
					approvalId: "approval-b",
					continuationRunId: continuationClaim.runId,
				}),
			]),
		);
		await finishWithTaskStatus(
			fixture,
			{ ...continuationClaim, claimToken: continuationToken },
			{
				status: "waiting",
				reason: "Wait for a later member turn.",
			},
		);
		const consumed = await fixture.base.run(async (ctx) => ({
			task: await ctx.db.get(claim.taskId),
			approvals: await Promise.all(
				["approval-a", "approval-b"].map(async (approvalId) =>
					ctx.db
						.query("agentItems")
						.withIndex("by_approval_id", (index) =>
							index.eq("approvalId", approvalId),
						)
						.unique(),
				),
			),
		}));
		expect(consumed.task).toMatchObject({
			status: "waiting",
			activeApprovalIds: [],
		});
		expect(consumed.approvals).toEqual([
			expect.objectContaining({ consumedAt: expect.any(Number) }),
			expect.objectContaining({ consumedAt: expect.any(Number) }),
		]);

		const later = await fixture.actor.mutation(api.agent.tasks.sendMessage, {
			taskId: claim.taskId,
			input: "Continue without replaying old approval decisions.",
		});
		const laterToken = crypto.randomUUID();
		const laterClaim = await fixture.base.mutation(
			api.agent.runtime.claimNextRun,
			{
				runtimeSecret: RUNTIME_SECRET,
				claimToken: laterToken,
				leaseDurationMs: 60_000,
			},
		);
		expect(laterClaim?.runId).toBe(later.runId);
	});

	it("paginates full audit history without exposing execution credentials", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		await startTool(fixture, claim, "audit-approval-tool", "update_case");
		await fixture.base.mutation(api.agent.runtime.recordToolApprovalRequest, {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
			toolCallId: "audit-approval-tool",
			approvalId: "audit-approval",
			request: "Approve the audited action?",
			signature: "secret-execution-signature",
		});
		const turns = await fixture.actor.query(api.agent.reader.listTurns, {
			taskId: claim.taskId,
			paginationOpts: { numItems: 1, cursor: null },
		});
		expect(turns.page).toHaveLength(1);
		const task = await fixture.actor.query(api.agent.reader.get, {
			taskId: claim.taskId,
		});
		expect(task?.task).toMatchObject({
			status: "waiting_for_approval",
			agentKey: "agent-v1",
		});
		expect(task?.task).not.toHaveProperty("activeRunIds");
		expect(task?.task).not.toHaveProperty("activeApprovalIds");
		const runs = await fixture.actor.query(api.agent.reader.listRuns, {
			taskId: claim.taskId,
			turnId: claim.turnId,
			paginationOpts: { numItems: 10, cursor: null },
		});
		expect(runs.page[0]?.run).toMatchObject({
			status: "running",
			claimedAt: expect.any(Number),
		});
		expect(runs.page[0]?.run).not.toHaveProperty("claimToken");
		expect(runs.page[0]?.run).not.toHaveProperty("leaseExpiresAt");
		const items = await fixture.actor.query(api.agent.reader.listItems, {
			taskId: claim.taskId,
			turnId: claim.turnId,
			paginationOpts: { numItems: 20, cursor: null },
		});
		const approval = items.page.find(
			(entry) =>
				entry.item.kind === "approval" &&
				entry.item.approvalId === "audit-approval",
		);
		expect(approval?.item).toMatchObject({
			kind: "approval",
			status: "pending",
		});
		expect(approval?.item).not.toHaveProperty("signature");
	});

	it("does not continue from early approval answers until the source run is stable", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		await startTool(fixture, claim, "early-a", "update_case");
		await fixture.base.mutation(api.agent.runtime.recordToolApprovalRequest, {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
			toolCallId: "early-a",
			approvalId: "early-approval-a",
			request: "Approve the first change?",
		});
		await startTool(fixture, claim, "early-b", "update_case");
		const [firstAnswer] = await Promise.all([
			fixture.actor.mutation(api.agent.tasks.answerApprovals, {
				taskId: claim.taskId,
				answers: [{ approvalId: "early-approval-a", approved: true }],
			}),
			fixture.base.mutation(api.agent.runtime.recordToolApprovalRequest, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				toolCallId: "early-b",
				approvalId: "early-approval-b",
				request: "Approve the later streamed change?",
			}),
		]);
		expect(firstAnswer).toEqual({ resumed: false });
		expect(
			await fixture.actor.mutation(api.agent.tasks.answerApprovals, {
				taskId: claim.taskId,
				answers: [{ approvalId: "early-approval-b", approved: false }],
			}),
		).toEqual({ resumed: false });
		expect(
			await fixture.base.query(api.agent.runtime.observeNextQueuedRun, {
				runtimeSecret: RUNTIME_SECRET,
			}),
		).toBeNull();

		await fixture.base.mutation(api.agent.runtime.finishRun, {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
		});
		const turns = await fixture.base.run(async (ctx) =>
			ctx.db
				.query("agentTurns")
				.withIndex("by_task_id_and_sequence", (index) =>
					index.eq("taskId", claim.taskId),
				)
				.collect(),
		);
		expect(turns).toHaveLength(2);
		expect(turns[1]).toMatchObject({
			sequence: 2,
			requestedBy: "system:approvalResolution",
		});
	});

	it("retires assigned decisions when a continuation fails and preserves its new approval", async () => {
		const fixture = await createFixture();
		const source = await delegateAndClaim(fixture);
		for (const approval of [
			{
				toolCallId: "old-approved-call",
				toolName: "update_case",
				approvalId: "old-approved",
			},
			{
				toolCallId: "old-denied-call",
				toolName: "update_case",
				approvalId: "old-denied",
			},
		]) {
			await startTool(fixture, source, approval.toolCallId, approval.toolName);
			await fixture.base.mutation(api.agent.runtime.recordToolApprovalRequest, {
				runtimeSecret: RUNTIME_SECRET,
				runId: source.runId,
				claimToken: source.claimToken,
				toolCallId: approval.toolCallId,
				approvalId: approval.approvalId,
				request: `Approve ${approval.toolCallId}?`,
			});
		}
		await fixture.base.mutation(api.agent.runtime.finishRun, {
			runtimeSecret: RUNTIME_SECRET,
			runId: source.runId,
			claimToken: source.claimToken,
		});
		const firstContinuation = await fixture.actor.mutation(
			api.agent.tasks.answerApprovals,
			{
				taskId: source.taskId,
				answers: [
					{ approvalId: "old-approved", approved: true },
					{ approvalId: "old-denied", approved: false },
				],
			},
		);
		if (!firstContinuation.resumed) {
			throw new Error("Expected the first approval continuation");
		}
		const firstContinuationToken = crypto.randomUUID();
		const firstContinuationClaim = await fixture.base.mutation(
			api.agent.runtime.claimNextRun,
			{
				runtimeSecret: RUNTIME_SECRET,
				claimToken: firstContinuationToken,
				leaseDurationMs: 60_000,
			},
		);
		if (!firstContinuationClaim) {
			throw new Error("Expected the first continuation claim");
		}

		await startTool(
			fixture,
			{
				runId: firstContinuationClaim.runId,
				claimToken: firstContinuationToken,
			},
			"old-approved-call",
			"update_case",
		);
		await fixture.base.mutation(api.agent.tools.updateCase, {
			runtimeSecret: RUNTIME_SECRET,
			runId: firstContinuationClaim.runId,
			claimToken: firstContinuationToken,
			toolCallId: "old-approved-call",
			caseId: fixture.caseId,
			description: "The old approved effect happened exactly once.",
		});
		await startTool(
			fixture,
			{
				runId: firstContinuationClaim.runId,
				claimToken: firstContinuationToken,
			},
			"new-approved-call",
			"update_case",
		);
		await fixture.base.mutation(api.agent.runtime.recordToolApprovalRequest, {
			runtimeSecret: RUNTIME_SECRET,
			runId: firstContinuationClaim.runId,
			claimToken: firstContinuationToken,
			toolCallId: "new-approved-call",
			approvalId: "new-approved",
			request: "Approve the newly requested change?",
		});
		await fixture.base.mutation(api.agent.runtime.failRun, {
			runtimeSecret: RUNTIME_SECRET,
			runId: firstContinuationClaim.runId,
			claimToken: firstContinuationToken,
			message: "The continuation failed after requesting new approval.",
		});

		const retired = await fixture.base.run(async (ctx) => ({
			task: await ctx.db.get(source.taskId),
			oldApproved: await ctx.db
				.query("agentItems")
				.withIndex("by_approval_id", (index) =>
					index.eq("approvalId", "old-approved"),
				)
				.unique(),
			oldDenied: await ctx.db
				.query("agentItems")
				.withIndex("by_approval_id", (index) =>
					index.eq("approvalId", "old-denied"),
				)
				.unique(),
			newApproval: await ctx.db
				.query("agentItems")
				.withIndex("by_approval_id", (index) =>
					index.eq("approvalId", "new-approved"),
				)
				.unique(),
		}));
		expect(retired.task).toMatchObject({
			status: "waiting_for_approval",
			activeRunIds: [],
			activeApprovalIds: [retired.newApproval?._id],
		});
		expect(retired.oldApproved).toMatchObject({
			continuationRunId: firstContinuationClaim.runId,
			consumedAt: expect.any(Number),
		});
		expect(retired.oldDenied).toMatchObject({
			status: "denied",
			continuationRunId: firstContinuationClaim.runId,
			consumedAt: expect.any(Number),
		});
		expect(retired.newApproval).toMatchObject({
			status: "pending",
		});
		expect(retired.newApproval).not.toHaveProperty("continuationRunId");

		const secondContinuation = await fixture.actor.mutation(
			api.agent.tasks.answerApprovals,
			{
				taskId: source.taskId,
				answers: [{ approvalId: "new-approved", approved: true }],
			},
		);
		if (!secondContinuation.resumed) {
			throw new Error("Expected the second approval continuation");
		}
		const secondContinuationToken = crypto.randomUUID();
		const secondContinuationClaim = await fixture.base.mutation(
			api.agent.runtime.claimNextRun,
			{
				runtimeSecret: RUNTIME_SECRET,
				claimToken: secondContinuationToken,
				leaseDurationMs: 60_000,
			},
		);
		if (!secondContinuationClaim) {
			throw new Error("Expected the second continuation claim");
		}
		expect(secondContinuationClaim.runId).toBe(secondContinuation.runId);
		await startTool(
			fixture,
			{
				runId: secondContinuationClaim.runId,
				claimToken: secondContinuationToken,
			},
			"new-approved-call",
			"update_case",
		);
		await fixture.base.mutation(api.agent.tools.updateCase, {
			runtimeSecret: RUNTIME_SECRET,
			runId: secondContinuationClaim.runId,
			claimToken: secondContinuationToken,
			toolCallId: "new-approved-call",
			caseId: fixture.caseId,
			title: "The new approval was applied",
		});
		await finishWithTaskStatus(
			fixture,
			{
				runId: secondContinuationClaim.runId,
				claimToken: secondContinuationToken,
			},
			{
				status: "completed",
				result: "Applied only the newly approved continuation.",
			},
		);

		const finalState = await fixture.base.run(async (ctx) => ({
			anchorCase: await ctx.db.get(fixture.caseId),
			oldApprovals: await Promise.all(
				["old-approved", "old-denied"].map(async (approvalId) =>
					ctx.db
						.query("agentItems")
						.withIndex("by_approval_id", (index) =>
							index.eq("approvalId", approvalId),
						)
						.unique(),
				),
			),
			newApproval: await ctx.db
				.query("agentItems")
				.withIndex("by_approval_id", (index) =>
					index.eq("approvalId", "new-approved"),
				)
				.unique(),
		}));
		expect(finalState.anchorCase).toMatchObject({
			title: "The new approval was applied",
			description: "The old approved effect happened exactly once.",
		});
		expect(finalState.oldApprovals).toEqual([
			expect.objectContaining({
				continuationRunId: firstContinuationClaim.runId,
			}),
			expect.objectContaining({
				continuationRunId: firstContinuationClaim.runId,
			}),
		]);
		expect(finalState.newApproval).toMatchObject({
			continuationRunId: secondContinuationClaim.runId,
			consumedAt: expect.any(Number),
		});
	});

	it("uses the lease watchdog DB write to release an answered approval source", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		await startTool(fixture, claim, "watchdog-approval", "update_case");
		await fixture.base.mutation(api.agent.runtime.recordToolApprovalRequest, {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
			toolCallId: "watchdog-approval",
			approvalId: "watchdog-approval-id",
			request: "Approve before this worker disappears?",
		});
		expect(
			await fixture.actor.mutation(api.agent.tasks.answerApprovals, {
				taskId: claim.taskId,
				answers: [{ approvalId: "watchdog-approval-id", approved: true }],
			}),
		).toEqual({ resumed: false });
		await fixture.base.run(async (ctx) => {
			await ctx.db.patch(claim.runId, { leaseExpiresAt: 0 });
		});

		await fixture.base.mutation(internal.agent.leases.requeueExpiredRun, {
			runId: claim.runId,
			leaseGeneration: 1,
		});
		const state = await fixture.base.run(async (ctx) => ({
			task: await ctx.db.get(claim.taskId),
			sourceRun: await ctx.db.get(claim.runId),
		}));
		expect(state.sourceRun).toMatchObject({ status: "cancelled" });
		expect(state.task).toMatchObject({
			status: "active",
			activeApprovalIds: expect.any(Array),
		});
		expect(state.task?.activeRunIds).toHaveLength(1);
		expect(
			await fixture.base.query(api.agent.runtime.observeNextQueuedRun, {
				runtimeSecret: RUNTIME_SECRET,
			}),
		).toBe(state.task?.activeRunIds[0]);
	});

	it("denies every pending approval on takeover and rejects late answers", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		for (const approvalId of ["takeover-a", "takeover-b"]) {
			await startTool(fixture, claim, `tool-${approvalId}`, "update_case");
			await fixture.base.mutation(api.agent.runtime.recordToolApprovalRequest, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				toolCallId: `tool-${approvalId}`,
				approvalId,
				request: `Approve ${approvalId}?`,
			});
		}

		await fixture.actor.mutation(api.agent.tasks.takeOverCase, {
			caseId: fixture.caseId,
			reason: "A member must handle the case.",
		});
		const approvals = await fixture.base.run(async (ctx) =>
			Promise.all(
				["takeover-a", "takeover-b"].map(async (approvalId) =>
					ctx.db
						.query("agentItems")
						.withIndex("by_approval_id", (index) =>
							index.eq("approvalId", approvalId),
						)
						.unique(),
				),
			),
		);
		expect(approvals).toEqual([
			expect.objectContaining({
				status: "denied",
				answerReason: expect.stringContaining("member takeover"),
			}),
			expect.objectContaining({
				status: "denied",
				answerReason: expect.stringContaining("member takeover"),
			}),
		]);
		await expect(
			fixture.actor.mutation(api.agent.tasks.answerApprovals, {
				taskId: claim.taskId,
				answers: [{ approvalId: "takeover-a", approved: true }],
			}),
		).rejects.toThrow("not waiting for approval");
	});
});
