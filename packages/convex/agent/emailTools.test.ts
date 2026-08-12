import {
	buildModelMessages,
	INBOUND_EMAIL_STEERING_SOURCE,
} from "@merimoar/agent";
import { describe, expect, it, vi } from "vitest";
import { dispatchDomainEvent } from "#/domainEvents";
import { insertResendIntegration } from "#/test.setup";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
	createFixture,
	delegateAndClaim,
	finishWithTaskStatus,
	loadCompleteRuntimeTranscript,
	RUNTIME_SECRET,
	startTool,
} from "./testSupport.test-helper";

type Fixture = Awaited<ReturnType<typeof createFixture>>;
type Claim = Awaited<ReturnType<typeof delegateAndClaim>>;

const EMAIL_BODY = "Thanks for the details. We have resolved the issue.";

async function configureOutboundEmail(fixture: Fixture) {
	return await fixture.base.run(async (ctx) => {
		const thread = await ctx.db.get(fixture.linkedThreadId);
		if (!thread) throw new Error("Expected linked email thread");
		const { integrationId } = await insertResendIntegration(
			ctx,
			fixture.organizationId,
			{ suffix: "agent_email" },
		);
		await ctx.db.patch(thread.inboxId, {
			outbound: {
				integrationId,
				address: "support@verified.example",
			},
		});
		const messageId = await ctx.db.insert("emailMessages", {
			inboxId: thread.inboxId,
			integrationId,
			threadId: thread._id,
			direction: "inbound",
			senderContactId: fixture.contactId,
			externalMessageId: "agent-email-inbound-1",
			internetMessageId: "<agent-email-inbound-1@example.com>",
			references: [],
			from: { address: "customer@example.com", name: "Customer" },
			to: [{ address: "agent-inbox@example.com" }],
			cc: [],
			bcc: [],
			replyTo: [],
			subject: "Need help",
			textBody: "Can you help with this?",
			sentAt: 1_000,
			receivedAt: 1_100,
		});
		await ctx.db.patch(thread._id, {
			latestMessageId: messageId,
			lastActivityAt: 1_100,
		});
		return { inboxId: thread.inboxId, integrationId };
	});
}

async function deliverInboundEmail(
	fixture: Fixture,
	config: {
		inboxId: Id<"emailInboxes">;
		integrationId: Id<"emailIntegrations">;
	},
	suffix: string,
	subject = "Re: Need help",
) {
	return await fixture.base.run(async (ctx) => {
		const messageId = await ctx.db.insert("emailMessages", {
			inboxId: config.inboxId,
			integrationId: config.integrationId,
			threadId: fixture.linkedThreadId,
			direction: "inbound",
			senderContactId: fixture.contactId,
			externalMessageId: `agent-email-inbound-${suffix}`,
			internetMessageId: `<agent-email-inbound-${suffix}@example.com>`,
			references: [],
			from: { address: "customer@example.com", name: "Customer" },
			to: [{ address: "agent-inbox@example.com" }],
			cc: [],
			bcc: [],
			replyTo: [],
			subject,
			textBody: "One more important detail.",
			sentAt: 2_000,
			receivedAt: 2_100,
		});
		await dispatchDomainEvent(ctx, {
			name: "email.messageReceived",
			payload: {
				messageId,
				threadId: fixture.linkedThreadId,
				receivedAt: 2_100,
			},
		});
		return messageId;
	});
}

async function claimQueuedRun(
	fixture: Fixture,
	expectedRunId: Id<"agentRuns">,
) {
	const claimToken = crypto.randomUUID();
	const claim = await fixture.base.mutation(api.agent.runtime.claimNextRun, {
		runtimeSecret: RUNTIME_SECRET,
		claimToken,
		leaseDurationMs: 60_000,
	});
	if (!claim || claim.runId !== expectedRunId) {
		throw new Error("Expected the queued email continuation run");
	}
	return { ...claim, claimToken };
}

async function retryAndLoadTranscript(fixture: Fixture, claim: Claim) {
	const retry = await fixture.actor.mutation(api.agent.tasks.retry, {
		taskId: claim.taskId,
	});
	const retryClaim = await claimQueuedRun(fixture, retry.runId);
	return {
		retryClaim,
		transcript: await loadCompleteRuntimeTranscript(fixture, retryClaim),
	};
}

async function finishScheduledInvalidation(fixture: Fixture) {
	await vi.advanceTimersByTimeAsync(0);
	await fixture.base.finishInProgressScheduledFunctions();
}

async function proposeEmail(
	fixture: Fixture,
	claim: Claim,
	ids: { toolCallId: string; approvalId: string },
	body = EMAIL_BODY,
) {
	const inputJson = JSON.stringify({
		threadId: fixture.linkedThreadId,
		body,
	});
	await fixture.base.mutation(api.agent.runtime.recordToolStarted, {
		runtimeSecret: RUNTIME_SECRET,
		runId: claim.runId,
		claimToken: claim.claimToken,
		toolCallId: ids.toolCallId,
		toolName: "send_email",
		inputJson,
		summary: "Sending an email reply",
	});
	const approvalItemId = await fixture.base.mutation(
		api.agent.runtime.recordToolApprovalRequest,
		{
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
			toolCallId: ids.toolCallId,
			approvalId: ids.approvalId,
			request: "Approve this email reply?",
		},
	);
	await fixture.base.mutation(api.agent.runtime.finishRun, {
		runtimeSecret: RUNTIME_SECRET,
		runId: claim.runId,
		claimToken: claim.claimToken,
	});
	return { approvalItemId, inputJson };
}

async function approveAndClaim(
	fixture: Fixture,
	claim: Claim,
	approvalId: string,
) {
	const answer = await fixture.actor.mutation(api.agent.tasks.answerApprovals, {
		taskId: claim.taskId,
		answers: [{ approvalId, approved: true }],
	});
	if (!answer.resumed) throw new Error("Expected approval continuation");
	const claimToken = crypto.randomUUID();
	const continuation = await fixture.base.mutation(
		api.agent.runtime.claimNextRun,
		{
			runtimeSecret: RUNTIME_SECRET,
			claimToken,
			leaseDurationMs: 60_000,
		},
	);
	if (!continuation || continuation.runId !== answer.runId) {
		throw new Error("Expected claimed approval continuation");
	}
	return { ...continuation, claimToken };
}

async function startApprovedEmailReplay(
	fixture: Fixture,
	continuation: { runId: Id<"agentRuns">; claimToken: string },
	toolCallId: string,
	inputJson: string,
) {
	await fixture.base.mutation(api.agent.runtime.recordToolStarted, {
		runtimeSecret: RUNTIME_SECRET,
		runId: continuation.runId,
		claimToken: continuation.claimToken,
		toolCallId,
		toolName: "send_email",
		inputJson,
		summary: "Sending an email reply",
	});
}

describe("agent email tool", () => {
	it("resumes a waiting task and batches email received before the run starts", async () => {
		const fixture = await createFixture();
		const config = await configureOutboundEmail(fixture);
		const claim = await delegateAndClaim(fixture);
		await finishWithTaskStatus(fixture, claim, {
			status: "waiting",
			reason: "Waiting for the customer.",
		});

		await deliverInboundEmail(fixture, config, "waiting-1");
		await deliverInboundEmail(fixture, config, "waiting-2");

		const state = await fixture.base.run(async (ctx) => {
			const task = await ctx.db.get(claim.taskId);
			const runId = task?.activeRunIds.at(-1);
			const run = runId ? await ctx.db.get(runId) : null;
			const turn = run ? await ctx.db.get(run.turnId) : null;
			return { run, runId, task, turn };
		});
		expect(state.task).toMatchObject({ status: "active" });
		expect(state.run).toMatchObject({ status: "queued" });
		expect(state.turn).toMatchObject({
			requestedBy: INBOUND_EMAIL_STEERING_SOURCE,
		});
		if (!state.runId) throw new Error("Expected a resumed run");

		const resumedClaim = await claimQueuedRun(fixture, state.runId);
		const transcript = await loadCompleteRuntimeTranscript(
			fixture,
			resumedClaim,
		);
		expect(buildModelMessages(transcript, resumedClaim.runId)).toContainEqual({
			role: "user",
			content:
				"You received 2 new email messages in “Re: Need help” while you were working. Read the email thread again before continuing.",
		});
	});

	it("batches email received during a run into one steering message", async () => {
		const fixture = await createFixture();
		const config = await configureOutboundEmail(fixture);
		const claim = await delegateAndClaim(fixture);

		await deliverInboundEmail(fixture, config, "running-1");
		await deliverInboundEmail(fixture, config, "running-2");

		const steering = await fixture.base.mutation(
			api.agent.runtime.getSteeringMessages,
			{
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				afterSequence: 0,
			},
		);
		expect(steering).toEqual([
			{
				body: "You received 2 new email messages in “Re: Need help” while you were working. Read the email thread again before continuing.",
				sequence: 2,
			},
		]);
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(claim.runId)),
		).toMatchObject({ lastSteeringSequence: 2 });

		await finishWithTaskStatus(fixture, claim, {
			status: "waiting",
			reason: "Waiting for another reply.",
		});
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(claim.taskId)),
		).toMatchObject({ status: "waiting" });
	});

	it("returns every member steer alongside one unbounded email batch", async () => {
		const fixture = await createFixture();
		const config = await configureOutboundEmail(fixture);
		const claim = await delegateAndClaim(fixture);
		for (let index = 0; index < 25; index += 1) {
			await deliverInboundEmail(fixture, config, `unbounded-${index}`);
		}
		await fixture.actor.mutation(api.agent.tasks.sendMessage, {
			taskId: claim.taskId,
			input: "Also preserve this human instruction.",
		});

		expect(
			await fixture.base.mutation(api.agent.runtime.getSteeringMessages, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				afterSequence: 0,
			}),
		).toEqual([
			{
				body: "Also preserve this human instruction.",
				sequence: 3,
			},
			{
				body: "You received 25 new email messages in “Re: Need help” while you were working. Read the email thread again before continuing.",
				sequence: 4,
			},
		]);
	});

	it("moves unread email to a new run after an explicit failure retry", async () => {
		const fixture = await createFixture();
		const config = await configureOutboundEmail(fixture);
		const claim = await delegateAndClaim(fixture);
		await deliverInboundEmail(fixture, config, "before-explicit-failure");
		await fixture.base.mutation(api.agent.runtime.failRun, {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
			message: "The provider request failed.",
		});

		const { retryClaim, transcript } = await retryAndLoadTranscript(
			fixture,
			claim,
		);
		expect(buildModelMessages(transcript, retryClaim.runId)).toContainEqual({
			role: "user",
			content:
				"You received 1 new email message in “Re: Need help” while you were working. Read the email thread again before continuing.",
		});
	});

	it("moves unread email to a new run after lease exhaustion retry", async () => {
		const fixture = await createFixture();
		const config = await configureOutboundEmail(fixture);
		const claim = await delegateAndClaim(fixture);
		await deliverInboundEmail(fixture, config, "before-lease-exhaustion");

		for (let loss = 1; loss <= 3; loss += 1) {
			const run = await fixture.base.run(async (ctx) =>
				ctx.db.get(claim.runId),
			);
			if (!run || run.status !== "running") {
				throw new Error("Expected a running lease-loss fixture");
			}
			await fixture.base.run(async (ctx) => {
				await ctx.db.patch(run._id, { leaseExpiresAt: 0 });
			});
			await fixture.base.mutation(internal.agent.leases.requeueExpiredRun, {
				runId: run._id,
				leaseGeneration: run.leaseGeneration,
			});
			if (loss < 3) {
				await claimQueuedRun(fixture, run._id);
			}
		}

		const { retryClaim, transcript } = await retryAndLoadTranscript(
			fixture,
			claim,
		);
		expect(buildModelMessages(transcript, retryClaim.runId)).toContainEqual({
			role: "user",
			content:
				"You received 1 new email message in “Re: Need help” while you were working. Read the email thread again before continuing.",
		});
	});

	it("moves every pending email into one catch-up run after status selection", async () => {
		const fixture = await createFixture();
		const config = await configureOutboundEmail(fixture);
		const claim = await delegateAndClaim(fixture);
		const toolCallId = "status-before-email";
		await startTool(fixture, claim, toolCallId, "update_task_status");
		await fixture.base.mutation(api.agent.runtime.stageTaskStatus, {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
			toolCallId,
			update: {
				status: "waiting",
				reason: "Waiting for the customer.",
			},
		});

		for (let index = 0; index < 25; index += 1) {
			await deliverInboundEmail(fixture, config, `finishing-${index}`);
		}
		await fixture.base.mutation(api.agent.runtime.finishRun, {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
		});

		const state = await fixture.base.run(async (ctx) => {
			const task = await ctx.db.get(claim.taskId);
			const runId = task?.activeRunIds.at(-1);
			const run = runId ? await ctx.db.get(runId) : null;
			const turn = run ? await ctx.db.get(run.turnId) : null;
			const items = turn
				? await ctx.db
						.query("agentItems")
						.withIndex("by_turn_id_and_sequence", (index) =>
							index.eq("turnId", turn._id),
						)
						.collect()
				: [];
			return { items, run, runId, task, turn };
		});
		expect(state.task).toMatchObject({ status: "active" });
		expect(state.run).toMatchObject({ status: "queued" });
		expect(state.turn).toMatchObject({
			requestedBy: INBOUND_EMAIL_STEERING_SOURCE,
		});
		const inboundEmailItems = state.items.flatMap((item) =>
			item.kind === "system_message" &&
			item.source === INBOUND_EMAIL_STEERING_SOURCE
				? [item]
				: [],
		);
		expect(inboundEmailItems).toHaveLength(1);
		expect(inboundEmailItems[0]).toMatchObject({
			inboundEmailMessageCount: 25,
		});
		expect(inboundEmailItems.every((item) => item.runId === state.runId)).toBe(
			true,
		);

		if (!state.runId) throw new Error("Expected an email catch-up run");
		const catchUpClaim = await claimQueuedRun(fixture, state.runId);
		const transcript = await loadCompleteRuntimeTranscript(
			fixture,
			catchUpClaim,
		);
		expect(buildModelMessages(transcript, catchUpClaim.runId)).toContainEqual({
			role: "user",
			content:
				"You received 25 new email messages in “Re: Need help” while you were working. Read the email thread again before continuing.",
		});
	});

	it("carries email received during task approval into its continuation", async () => {
		const fixture = await createFixture();
		const config = await configureOutboundEmail(fixture);
		const claim = await delegateAndClaim(fixture);
		await finishWithTaskStatus(fixture, claim, {
			status: "waiting_for_approval",
			approvalId: "task-email-approval",
			approvalRequest: "Approve the proposed resolution?",
		});

		for (let index = 0; index < 25; index += 1) {
			await deliverInboundEmail(
				fixture,
				config,
				`during-task-approval-${index}`,
			);
		}
		const continuation = await approveAndClaim(
			fixture,
			claim,
			"task-email-approval",
		);
		const transcript = await loadCompleteRuntimeTranscript(
			fixture,
			continuation,
		);
		const inboundEmailItem = transcript.turns
			.flatMap((turn) => turn.items)
			.find(
				(item) =>
					item.kind === "system_message" &&
					item.inboundEmailMessageCount !== undefined,
			);
		expect(inboundEmailItem).toMatchObject({
			kind: "system_message",
			inboundEmailMessageCount: 25,
			runId: continuation.runId,
		});
		expect(buildModelMessages(transcript, continuation.runId)).toContainEqual({
			role: "user",
			content:
				"You received 25 new email messages in “Re: Need help” while you were working. Read the email thread again before continuing.",
		});
	});

	it("carries email received during a running tool approval into its continuation", async () => {
		vi.useFakeTimers();
		try {
			const fixture = await createFixture();
			const config = await configureOutboundEmail(fixture);
			const claim = await delegateAndClaim(fixture);
			const toolCallId = "running-email-approval-tool";
			const approvalId = "running-email-approval";
			await fixture.base.mutation(api.agent.runtime.recordToolStarted, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				toolCallId,
				toolName: "send_email",
				inputJson: JSON.stringify({
					threadId: fixture.linkedThreadId,
					body: EMAIL_BODY,
				}),
				summary: "Sending an email reply",
			});
			const approvalItemId = await fixture.base.mutation(
				api.agent.runtime.recordToolApprovalRequest,
				{
					runtimeSecret: RUNTIME_SECRET,
					runId: claim.runId,
					claimToken: claim.claimToken,
					toolCallId,
					approvalId,
					request: "Approve this email reply?",
				},
			);

			await deliverInboundEmail(
				fixture,
				config,
				"during-running-tool-approval",
			);
			await finishScheduledInvalidation(fixture);
			expect(
				await fixture.base.run(async (ctx) => ({
					approval: await ctx.db.get(approvalItemId),
					task: await ctx.db.get(claim.taskId),
				})),
			).toMatchObject({
				approval: { status: "invalidated" },
				task: {
					status: "waiting_for_approval",
					activeRunIds: [claim.runId],
				},
			});

			await fixture.base.mutation(api.agent.runtime.finishRun, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
			});
			const task = await fixture.base.run(async (ctx) =>
				ctx.db.get(claim.taskId),
			);
			const continuationRunId = task?.activeRunIds.at(-1);
			if (!continuationRunId) {
				throw new Error("Expected a tool approval continuation run");
			}
			const continuation = await claimQueuedRun(fixture, continuationRunId);
			const transcript = await loadCompleteRuntimeTranscript(
				fixture,
				continuation,
			);
			const inboundEmailItem = transcript.turns
				.flatMap((turn) => turn.items)
				.find(
					(item) =>
						item.kind === "system_message" &&
						item.inboundEmailMessageCount !== undefined,
				);
			expect(inboundEmailItem).toMatchObject({
				kind: "system_message",
				inboundEmailMessageCount: 1,
				runId: continuation.runId,
			});
			expect(buildModelMessages(transcript, continuation.runId)).toContainEqual(
				{
					role: "user",
					content:
						"You received 1 new email message in “Re: Need help” while you were working. Read the email thread again before continuing.",
				},
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it("queues an approved reply through the existing outbound pipeline and attributes it to the task", async () => {
		const fixture = await createFixture();
		await configureOutboundEmail(fixture);
		await fixture.actor.mutation(api.agent.builtInTools.setEmailSendingActive, {
			active: true,
		});
		const claim = await delegateAndClaim(fixture);
		const ids = { toolCallId: "send-email-1", approvalId: "email-approval-1" };
		const body = `  \n${EMAIL_BODY}\t  `;
		const { inputJson } = await proposeEmail(fixture, claim, ids, body);
		const continuation = await approveAndClaim(fixture, claim, ids.approvalId);
		await startApprovedEmailReplay(
			fixture,
			continuation,
			ids.toolCallId,
			inputJson,
		);

		const input = {
			runtimeSecret: RUNTIME_SECRET,
			runId: continuation.runId,
			claimToken: continuation.claimToken,
			toolCallId: ids.toolCallId,
			threadId: fixture.linkedThreadId,
			body,
		};
		const queued = await fixture.base.mutation(
			api.agent.tools.sendEmail,
			input,
		);
		expect(queued).toMatchObject({
			status: "queued_successfully",
			deduplicated: false,
		});
		const firstPersistedOutput = await fixture.base.run(async (ctx) => {
			const item = await ctx.db
				.query("agentItems")
				.withIndex("by_run_id_and_tool_call_id", (index) =>
					index
						.eq("runId", continuation.runId)
						.eq("toolCallId", ids.toolCallId),
				)
				.unique();
			if (
				!item ||
				item.kind !== "tool" ||
				item.status !== "completed" ||
				!("outputJson" in item)
			) {
				throw new Error("Expected completed email tool item");
			}
			expect(item.inputJson).toBe(inputJson);
			return JSON.parse(item.outputJson);
		});
		expect(firstPersistedOutput).toEqual(queued);

		const duplicate = await fixture.base.mutation(
			api.agent.tools.sendEmail,
			input,
		);
		expect(duplicate).toMatchObject({
			status: "queued_successfully",
			deduplicated: true,
			messageId: queued.messageId,
			sendId: queued.sendId,
		});

		const persisted = await fixture.base.run(async (ctx) => ({
			message: await ctx.db.get(queued.messageId),
			send: await ctx.db.get(queued.sendId),
			tool: await ctx.db
				.query("agentItems")
				.withIndex("by_run_id_and_tool_call_id", (index) =>
					index
						.eq("runId", continuation.runId)
						.eq("toolCallId", ids.toolCallId),
				)
				.unique(),
		}));
		expect(persisted.message).toMatchObject({
			direction: "outbound",
			authoredByAgentTaskId: claim.taskId,
			threadId: fixture.linkedThreadId,
			textBody: EMAIL_BODY,
		});
		expect(persisted.send).toMatchObject({
			messageId: queued.messageId,
			status: "queued",
		});
		if (
			persisted.tool?.kind !== "tool" ||
			persisted.tool.status !== "completed" ||
			!("outputJson" in persisted.tool)
		) {
			throw new Error("Expected completed email tool item");
		}
		expect(JSON.parse(persisted.tool.outputJson)).toEqual(duplicate);

		await fixture.base.mutation(
			internal.email.outbound.establishProviderAcceptance,
			{
				messageId: queued.messageId,
				sendId: queued.sendId,
				externalMessageId: "agent-email-provider-id",
				internetMessageId: "<agent-email-provider-id@example.com>",
				acceptedAt: 2_000,
			},
		);
		const outboundEvent = await fixture.base.run(async (ctx) =>
			ctx.db
				.query("caseEvents")
				.withIndex("by_case_id_and_email_message_id", (index) =>
					index
						.eq("caseId", fixture.caseId)
						.eq("emailMessageId", queued.messageId),
				)
				.unique(),
		);
		expect(outboundEvent).toMatchObject({
			type: "outbound_email",
			emailMessageId: queued.messageId,
			createdByMemberId: null,
		});
	});

	it("invalidates a pending reply when a new email arrives", async () => {
		vi.useFakeTimers();
		try {
			const fixture = await createFixture();
			const config = await configureOutboundEmail(fixture);
			await fixture.actor.mutation(
				api.agent.builtInTools.setEmailSendingActive,
				{ active: true },
			);
			const claim = await delegateAndClaim(fixture);
			const ids = {
				toolCallId: "send-email-2",
				approvalId: "email-approval-2",
			};
			const { approvalItemId } = await proposeEmail(fixture, claim, ids);
			const newMessageId = await deliverInboundEmail(fixture, config, "2");
			await finishScheduledInvalidation(fixture);

			const state = await fixture.base.run(async (ctx) => ({
				approval: await ctx.db.get(approvalItemId),
				task: await ctx.db.get(claim.taskId),
			}));
			expect(state.approval).toMatchObject({
				kind: "approval",
				status: "invalidated",
				invalidationCause: {
					kind: "inbound_email_received",
					messageId: newMessageId,
				},
				continuationRunId: expect.any(String),
			});
			expect(state.task).toMatchObject({ status: "active" });
		} finally {
			vi.useRealTimers();
		}
	});

	it("invalidates a pending reply after its case relation was removed", async () => {
		vi.useFakeTimers();
		try {
			const fixture = await createFixture();
			const config = await configureOutboundEmail(fixture);
			await fixture.actor.mutation(
				api.agent.builtInTools.setEmailSendingActive,
				{ active: true },
			);
			const claim = await delegateAndClaim(fixture);
			const { approvalItemId } = await proposeEmail(fixture, claim, {
				toolCallId: "send-email-unlinked-before-inbound",
				approvalId: "email-approval-unlinked-before-inbound",
			});
			await fixture.base.run(async (ctx) => {
				await ctx.db.patch(fixture.emailRelationId, {
					endedAt: Date.now(),
					unlinkedByMemberId: fixture.memberId,
				});
			});

			const messageId = await deliverInboundEmail(
				fixture,
				config,
				"after-unlink",
			);
			await finishScheduledInvalidation(fixture);

			expect(
				await fixture.base.run(async (ctx) => ctx.db.get(approvalItemId)),
			).toMatchObject({
				status: "invalidated",
				invalidationCause: {
					kind: "inbound_email_received",
					messageId,
				},
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("invalidates the original case approval after the thread moved to another case", async () => {
		vi.useFakeTimers();
		try {
			const fixture = await createFixture();
			const config = await configureOutboundEmail(fixture);
			await fixture.actor.mutation(
				api.agent.builtInTools.setEmailSendingActive,
				{ active: true },
			);
			const claim = await delegateAndClaim(fixture);
			const { approvalItemId } = await proposeEmail(fixture, claim, {
				toolCallId: "send-email-moved-before-inbound",
				approvalId: "email-approval-moved-before-inbound",
			});
			await fixture.base.run(async (ctx) => {
				await ctx.db.patch(fixture.emailRelationId, {
					endedAt: Date.now(),
					unlinkedByMemberId: fixture.memberId,
				});
				await ctx.db.insert("caseEmailThreadRelations", {
					caseId: fixture.secondCaseId,
					threadId: fixture.linkedThreadId,
					startedAt: Date.now(),
					endedAt: null,
					linkedByMemberId: fixture.memberId,
					unlinkedByMemberId: null,
				});
			});

			const messageId = await deliverInboundEmail(
				fixture,
				config,
				"after-move",
			);
			await finishScheduledInvalidation(fixture);

			expect(
				await fixture.base.run(async (ctx) => ctx.db.get(approvalItemId)),
			).toMatchObject({
				status: "invalidated",
				invalidationCause: {
					kind: "inbound_email_received",
					messageId,
				},
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("rejects an approved reply if another email arrives before execution", async () => {
		const fixture = await createFixture();
		const config = await configureOutboundEmail(fixture);
		await fixture.actor.mutation(api.agent.builtInTools.setEmailSendingActive, {
			active: true,
		});
		const claim = await delegateAndClaim(fixture);
		const ids = {
			toolCallId: "send-email-stale",
			approvalId: "email-approval-stale",
		};
		const proposal = await proposeEmail(fixture, claim, ids);
		const continuation = await approveAndClaim(fixture, claim, ids.approvalId);
		await startApprovedEmailReplay(
			fixture,
			continuation,
			ids.toolCallId,
			proposal.inputJson,
		);
		await deliverInboundEmail(fixture, config, "after-approval");

		await expect(
			fixture.base.mutation(api.agent.tools.sendEmail, {
				runtimeSecret: RUNTIME_SECRET,
				runId: continuation.runId,
				claimToken: continuation.claimToken,
				toolCallId: ids.toolCallId,
				threadId: fixture.linkedThreadId,
				body: EMAIL_BODY,
			}),
		).rejects.toThrow("A new email arrived in the thread");
	});

	it("rejects an approved reply when the thread is no longer related to the case", async () => {
		const fixture = await createFixture();
		await configureOutboundEmail(fixture);
		await fixture.actor.mutation(api.agent.builtInTools.setEmailSendingActive, {
			active: true,
		});
		const claim = await delegateAndClaim(fixture);
		const ids = {
			toolCallId: "send-email-unlinked",
			approvalId: "email-approval-unlinked",
		};
		const proposal = await proposeEmail(fixture, claim, ids);
		const continuation = await approveAndClaim(fixture, claim, ids.approvalId);
		await startApprovedEmailReplay(
			fixture,
			continuation,
			ids.toolCallId,
			proposal.inputJson,
		);
		await fixture.base.run(async (ctx) => {
			await ctx.db.patch(fixture.emailRelationId, {
				endedAt: Date.now(),
				unlinkedByMemberId: fixture.memberId,
			});
		});

		await expect(
			fixture.base.mutation(api.agent.tools.sendEmail, {
				runtimeSecret: RUNTIME_SECRET,
				runId: continuation.runId,
				claimToken: continuation.claimToken,
				toolCallId: ids.toolCallId,
				threadId: fixture.linkedThreadId,
				body: EMAIL_BODY,
			}),
		).rejects.toThrow("not actively related to the delegated case");
	});

	it("dispatches disable invalidation through the organization domain event", async () => {
		vi.useFakeTimers();
		try {
			const fixture = await createFixture();
			await fixture.actor.mutation(
				api.agent.builtInTools.setEmailSendingActive,
				{ active: true },
			);
			const pendingClaim = await delegateAndClaim(fixture);
			const pendingIds = {
				toolCallId: "send-email-pending-disable",
				approvalId: "email-approval-pending-disable",
			};
			const { approvalItemId } = await proposeEmail(
				fixture,
				pendingClaim,
				pendingIds,
			);
			await fixture.actor.mutation(
				api.agent.builtInTools.setEmailSendingActive,
				{ active: false },
			);

			await finishScheduledInvalidation(fixture);

			expect(
				await fixture.base.run(async (ctx) => ctx.db.get(approvalItemId)),
			).toMatchObject({
				status: "invalidated",
				invalidationCause: { kind: "email_tool_disabled" },
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("creates a system-invalidated approval when an old run proposes email after disable invalidation completed", async () => {
		vi.useFakeTimers();
		try {
			const fixture = await createFixture();
			await fixture.actor.mutation(
				api.agent.builtInTools.setEmailSendingActive,
				{ active: true },
			);
			const claim = await delegateAndClaim(fixture);
			const toolCallId = "send-email-after-disable-batch";
			await fixture.base.mutation(api.agent.runtime.recordToolStarted, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				toolCallId,
				toolName: "send_email",
				inputJson: JSON.stringify({
					threadId: fixture.linkedThreadId,
					body: EMAIL_BODY,
				}),
				summary: "Sending an email reply",
			});

			await fixture.actor.mutation(
				api.agent.builtInTools.setEmailSendingActive,
				{ active: false },
			);
			await finishScheduledInvalidation(fixture);

			const approvalItemId = await fixture.base.mutation(
				api.agent.runtime.recordToolApprovalRequest,
				{
					runtimeSecret: RUNTIME_SECRET,
					runId: claim.runId,
					claimToken: claim.claimToken,
					toolCallId,
					approvalId: "email-approval-after-disable-batch",
					request: "Approve this email reply?",
				},
			);
			await fixture.base.mutation(api.agent.runtime.finishRun, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
			});

			const state = await fixture.base.run(async (ctx) => ({
				approval: await ctx.db.get(approvalItemId),
				task: await ctx.db.get(claim.taskId),
			}));
			expect(state.approval).toMatchObject({
				status: "invalidated",
				invalidationCause: { kind: "email_tool_disabled" },
				continuationRunId: expect.any(String),
			});
			expect(state.task).toMatchObject({ status: "active" });
		} finally {
			vi.useRealTimers();
		}
	});

	it("rejects an approved send if email is disabled before execution", async () => {
		const secondFixture = await createFixture();
		await configureOutboundEmail(secondFixture);
		await secondFixture.actor.mutation(
			api.agent.builtInTools.setEmailSendingActive,
			{ active: true },
		);
		const approvedClaim = await delegateAndClaim(secondFixture);
		const approvedIds = {
			toolCallId: "send-email-approved-disable",
			approvalId: "email-approval-approved-disable",
		};
		const approvedProposal = await proposeEmail(
			secondFixture,
			approvedClaim,
			approvedIds,
		);
		const continuation = await approveAndClaim(
			secondFixture,
			approvedClaim,
			approvedIds.approvalId,
		);
		await startApprovedEmailReplay(
			secondFixture,
			continuation,
			approvedIds.toolCallId,
			approvedProposal.inputJson,
		);
		await secondFixture.actor.mutation(
			api.agent.builtInTools.setEmailSendingActive,
			{ active: false },
		);

		await expect(
			secondFixture.base.mutation(api.agent.tools.sendEmail, {
				runtimeSecret: RUNTIME_SECRET,
				runId: continuation.runId,
				claimToken: continuation.claimToken,
				toolCallId: approvedIds.toolCallId,
				threadId: secondFixture.linkedThreadId,
				body: EMAIL_BODY,
			}),
		).rejects.toThrow("agent tool is disabled");
	});
});
