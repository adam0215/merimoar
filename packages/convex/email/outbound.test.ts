import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { readResendInternetMessageId } from "#/email/outboundModel";
import {
	classifyResendSendError,
	createResendSendRequest,
} from "#/email/outboundResendProvider";
import {
	createConnectedResendIntegration,
	createTest,
	syncWorkosUser,
} from "#/test.setup";
import { api, internal } from "../_generated/api";

const ISSUER = "https://api.workos.com/";

async function createFixture() {
	const base = createTest();
	await Promise.all([
		syncWorkosUser(base, {
			id: "user_adam",
			name: "Adam",
			email: "adam@merimoar.com",
		}),
		syncWorkosUser(base, {
			id: "user_other",
			name: "Other",
			email: "other@example.com",
		}),
		syncWorkosUser(base, {
			id: "user_sara",
			name: "Sara",
			email: "sara@merimoar.com",
		}),
	]);
	const ids = await base.run(async (ctx) => {
		const organizationId = await ctx.db.insert("organizations", {
			name: "Merimoar",
			workosOrganizationId: "org_merimoar",
			active: true,
		});
		const otherOrganizationId = await ctx.db.insert("organizations", {
			name: "Other",
			workosOrganizationId: "org_other",
			active: true,
		});
		const memberId = await ctx.db.insert("organizationMembers", {
			organizationId,
			workosUserId: "user_adam",
			active: true,
		});
		const secondMemberId = await ctx.db.insert("organizationMembers", {
			organizationId,
			workosUserId: "user_sara",
			active: true,
		});
		const otherMemberId = await ctx.db.insert("organizationMembers", {
			organizationId: otherOrganizationId,
			workosUserId: "user_other",
			active: true,
		});
		const inboxId = await ctx.db.insert("emailInboxes", {
			organizationId,
			displayName: "Support",
			address: "support@merimoar.test",
			status: "active",
			unreadThreadCount: 0,
		});
		const otherInboxId = await ctx.db.insert("emailInboxes", {
			organizationId: otherOrganizationId,
			displayName: "Other",
			address: "support@other.test",
			status: "active",
			unreadThreadCount: 0,
		});
		const threadId = await ctx.db.insert("emailThreads", {
			organizationId,
			inboxId,
			lastActivityAt: 1_000,
		});
		const otherThreadId = await ctx.db.insert("emailThreads", {
			organizationId: otherOrganizationId,
			inboxId: otherInboxId,
			lastActivityAt: 1_000,
		});
		const contactId = await ctx.db.insert("contacts", {
			organizationId,
			address: "customer@example.com",
			name: "Customer",
			firstSeenAt: 1_000,
			lastSeenAt: 1_000,
		});
		const inboundMessageId = await ctx.db.insert("emailMessages", {
			inboxId,
			integrationId: await ctx.db.insert("emailIntegrations", {
				organizationId,
				provider: "resend",
				status: "connected",
				workosUserId: "user_adam",
				workosOrganizationId: "org_merimoar",
				workosDataIntegrationId: "data_integration_inbound",
				workosConnectedAccountId: "connected_account_inbound",
				workosConnectedAccountUpdatedAt: 1_000,
			}),
			threadId,
			direction: "inbound",
			senderContactId: contactId,
			externalMessageId: "inbound-provider-id",
			internetMessageId: "<inbound@example.com>",
			inReplyTo: "<older@example.com>",
			references: ["<oldest@example.com>", "<older@example.com>"],
			from: { address: "customer@example.com", name: "Customer" },
			to: [{ address: "support@merimoar.test" }],
			cc: [],
			bcc: [],
			replyTo: [{ address: "reply-to@example.com", name: "Replies" }],
			subject: "Re: RE: Need help",
			textBody: "Please help.",
			sentAt: 1_000,
			receivedAt: 1_100,
		});
		await ctx.db.patch(threadId, {
			latestMessageId: inboundMessageId,
		});
		const otherInboundIntegrationId = await ctx.db.insert("emailIntegrations", {
			organizationId: otherOrganizationId,
			provider: "resend",
			status: "connected",
			workosUserId: "user_other",
			workosOrganizationId: "org_other",
			workosDataIntegrationId: "data_integration_other_inbound",
			workosConnectedAccountId: "connected_account_other_inbound",
			workosConnectedAccountUpdatedAt: 1_000,
		});
		const otherContactId = await ctx.db.insert("contacts", {
			organizationId: otherOrganizationId,
			address: "customer@other.test",
			firstSeenAt: 1_000,
			lastSeenAt: 1_000,
		});
		const otherInboundMessageId = await ctx.db.insert("emailMessages", {
			inboxId: otherInboxId,
			integrationId: otherInboundIntegrationId,
			threadId: otherThreadId,
			direction: "inbound",
			senderContactId: otherContactId,
			externalMessageId: "other-inbound-provider-id",
			internetMessageId: "<other-inbound@example.com>",
			references: [],
			from: { address: "customer@other.test" },
			to: [{ address: "support@other.test" }],
			cc: [],
			bcc: [],
			replyTo: [],
			subject: "Other request",
			textBody: "Help.",
			sentAt: 1_000,
			receivedAt: 1_100,
		});
		await ctx.db.patch(otherThreadId, {
			latestMessageId: otherInboundMessageId,
		});
		return {
			organizationId,
			otherOrganizationId,
			memberId,
			secondMemberId,
			otherMemberId,
			inboxId,
			otherInboxId,
			threadId,
			otherThreadId,
			inboundMessageId,
		};
	});
	const integrationId = await createConnectedResendIntegration(
		base,
		ids.organizationId,
		"outbound",
	);
	const otherIntegrationId = await createConnectedResendIntegration(
		base,
		ids.otherOrganizationId,
		"other-outbound",
	);
	await base.run(async (ctx) => {
		await ctx.db.patch(ids.inboxId, {
			outbound: {
				integrationId,
				address: "replies@verified.example",
			},
		});
		await ctx.db.patch(ids.otherInboxId, {
			outbound: {
				integrationId: otherIntegrationId,
				address: "replies@other-verified.example",
			},
		});
	});
	return {
		base,
		actor: base.withIdentity({
			issuer: ISSUER,
			subject: "user_adam",
			org_id: "org_merimoar",
		}),
		otherActor: base.withIdentity({
			issuer: ISSUER,
			subject: "user_other",
			org_id: "org_other",
		}),
		secondActor: base.withIdentity({
			issuer: ISSUER,
			subject: "user_sara",
			org_id: "org_merimoar",
		}),
		integrationId,
		otherIntegrationId,
		...ids,
	};
}

async function saveAndQueue(
	fixture: Awaited<ReturnType<typeof createFixture>>,
	clientRequestId = "request-1",
) {
	const draft = await fixture.actor.mutation(api.email.outbound.saveDraft, {
		threadId: fixture.threadId,
		body: "A plain-text reply.",
	});
	return await fixture.actor.mutation(api.email.outbound.queueReply, {
		threadId: fixture.threadId,
		draftRevision: draft.revision,
		clientRequestId,
	});
}

type OutboundFixture = Awaited<ReturnType<typeof createFixture>>;
type QueuedReply = Awaited<ReturnType<typeof saveAndQueue>>;

function sendTransitionArgs(queued: QueuedReply, generation = 0) {
	return {
		sendId: queued.sendId,
		messageId: queued.messageId,
		generation,
	};
}

async function prepareSendAttempt(
	fixture: OutboundFixture,
	queued: QueuedReply,
	generation = 0,
) {
	return await fixture.base.mutation(
		internal.email.outbound.prepareSendAttempt,
		sendTransitionArgs(queued, generation),
	);
}

async function beginProviderCall(
	fixture: OutboundFixture,
	queued: QueuedReply,
	generation = 0,
) {
	return await fixture.base.mutation(
		internal.email.outbound.beginProviderCall,
		sendTransitionArgs(queued, generation),
	);
}

async function requireWorkId(fixture: OutboundFixture, queued: QueuedReply) {
	const workId = await fixture.base.run(
		async (ctx) => (await ctx.db.get(queued.sendId))?.workId,
	);
	if (!workId) {
		throw new Error("Expected outbound email work");
	}
	return workId;
}

async function expectErrorCode(promise: Promise<unknown>, code: string) {
	await expect(promise).rejects.toSatisfy((error) => {
		expect(error).toBeInstanceOf(ConvexError);
		expect((error as ConvexError<{ code: string }>).data.code).toBe(code);
		return true;
	});
}

describe("outbound email replies", () => {
	it("classifies Resend failures by provider semantics", () => {
		expect(
			classifyResendSendError({
				name: "invalid_api_key",
				statusCode: 403,
			}),
		).toBe("authorization");
		expect(
			classifyResendSendError({
				name: "validation_error",
				statusCode: 403,
			}),
		).toBe("configuration");
		expect(
			classifyResendSendError({
				name: "validation_error",
				statusCode: 401,
			}),
		).toBe("configuration");
		expect(
			classifyResendSendError({
				name: "concurrent_idempotent_requests",
				statusCode: 409,
			}),
		).toBe("transient");
		expect(
			classifyResendSendError({
				name: "rate_limit_exceeded",
				statusCode: 429,
			}),
		).toBe("transient");
		expect(
			classifyResendSendError({
				name: "daily_quota_exceeded",
				statusCode: 429,
			}),
		).toBe("configuration");
		expect(
			classifyResendSendError({
				name: "monthly_quota_exceeded",
				statusCode: 429,
			}),
		).toBe("configuration");
	});

	it("narrows the webhook RFC Message-ID field safely across SDK versions", () => {
		expect(
			readResendInternetMessageId({
				message_id: "  <sent@example.com>  ",
			}),
		).toBe("<sent@example.com>");
		expect(readResendInternetMessageId({})).toBeUndefined();
		expect(readResendInternetMessageId({ message_id: 123 })).toBeUndefined();
	});

	it("marks an unread thread as read without drifting the inbox count", async () => {
		const fixture = await createFixture();
		await fixture.base.run(async (ctx) => {
			await ctx.db.patch(fixture.threadId, { isUnread: true });
			await ctx.db.patch(fixture.inboxId, { unreadThreadCount: 1 });
		});

		await saveAndQueue(fixture);

		const state = await fixture.base.run(async (ctx) => ({
			thread: await ctx.db.get(fixture.threadId),
			inbox: await ctx.db.get(fixture.inboxId),
		}));
		expect(state.thread?.isUnread).toBe(false);
		expect(state.inbox?.unreadThreadCount).toBe(0);
	});

	it("blocks reserved demo recipients before queueing or calling the provider", async () => {
		const fixture = await createFixture();
		await fixture.base.run(async (ctx) => {
			await ctx.db.patch(fixture.inboundMessageId, {
				from: {
					address: "customer@seed-kund.invalid",
					name: "Seed customer",
				},
				replyTo: [],
			});
		});
		const draft = await fixture.actor.mutation(api.email.outbound.saveDraft, {
			threadId: fixture.threadId,
			body: "This must never leave the demo inbox.",
		});

		await expectErrorCode(
			fixture.actor.mutation(api.email.outbound.queueReply, {
				threadId: fixture.threadId,
				draftRevision: draft.revision,
				clientRequestId: "reserved-demo-recipient",
			}),
			"EMAIL_RECIPIENT_NON_DELIVERABLE",
		);
		expect(
			await fixture.base.run(async (ctx) =>
				ctx.db.query("emailSends").collect(),
			),
		).toHaveLength(0);

		const unsafeSend = await fixture.base.run(async (ctx) => {
			const messageId = await ctx.db.insert("emailMessages", {
				inboxId: fixture.inboxId,
				integrationId: fixture.integrationId,
				threadId: fixture.threadId,
				direction: "outbound",
				authoredByMemberId: fixture.memberId,
				from: { address: "replies@verified.example" },
				to: [{ address: "customer@seed-kund.invalid" }],
				cc: [],
				bcc: [],
				replyTo: [],
				references: [],
				subject: "Unsafe fixture",
				textBody: "This should be stopped by the worker boundary.",
				sentAt: 2_000,
			});
			const sendId = await ctx.db.insert("emailSends", {
				messageId,
				requestedByMemberId: fixture.memberId,
				clientRequestId: "unsafe-direct-write",
				status: "queued",
				generation: 0,
				attemptCount: 0,
			});
			return { messageId, sendId, deduplicated: false };
		});

		expect(await prepareSendAttempt(fixture, unsafeSend)).toBeNull();
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(unsafeSend.sendId)),
		).toMatchObject({
			status: "failed",
			failure: {
				kind: "permanent",
				message: "Replies to reserved demo addresses cannot be sent.",
			},
		});
	});

	it("atomically snapshots routing and scopes client idempotency to the requesting actor", async () => {
		const fixture = await createFixture();
		const queued = await saveAndQueue(fixture);
		const duplicate = await fixture.actor.mutation(
			api.email.outbound.queueReply,
			{
				threadId: fixture.threadId,
				draftRevision: 1,
				clientRequestId: "request-1",
			},
		);
		expect(duplicate).toEqual({ ...queued, deduplicated: true });

		const conflictingThreadId = await fixture.base.run(async (ctx) => {
			return await ctx.db.insert("emailThreads", {
				organizationId: fixture.organizationId,
				inboxId: fixture.inboxId,
				lastActivityAt: 1_000,
			});
		});
		await expectErrorCode(
			fixture.actor.mutation(api.email.outbound.queueReply, {
				threadId: conflictingThreadId,
				draftRevision: 1,
				clientRequestId: "request-1",
			}),
			"EMAIL_CLIENT_REQUEST_ID_CONFLICT",
		);

		const secondActorDraft = await fixture.secondActor.mutation(
			api.email.outbound.saveDraft,
			{
				threadId: fixture.threadId,
				body: "Same tenant, different actor.",
			},
		);
		const secondActorQueued = await fixture.secondActor.mutation(
			api.email.outbound.queueReply,
			{
				threadId: fixture.threadId,
				draftRevision: secondActorDraft.revision,
				clientRequestId: "request-1",
			},
		);
		const otherDraft = await fixture.otherActor.mutation(
			api.email.outbound.saveDraft,
			{
				threadId: fixture.otherThreadId,
				body: "Other tenant",
			},
		);
		const otherQueued = await fixture.otherActor.mutation(
			api.email.outbound.queueReply,
			{
				threadId: fixture.otherThreadId,
				draftRevision: otherDraft.revision,
				clientRequestId: "request-1",
			},
		);
		expect(secondActorQueued.deduplicated).toBe(false);
		expect(otherQueued.deduplicated).toBe(false);

		const state = await fixture.base.run(async (ctx) => ({
			message: await ctx.db.get(queued.messageId),
			send: await ctx.db.get(queued.sendId),
			secondActorSend: await ctx.db.get(secondActorQueued.sendId),
			otherSend: await ctx.db.get(otherQueued.sendId),
			drafts: await ctx.db
				.query("emailDrafts")
				.withIndex("by_thread_id_and_author_member_id", (index) =>
					index
						.eq("threadId", fixture.threadId)
						.eq("authorMemberId", fixture.memberId),
				)
				.collect(),
			thread: await ctx.db.get(fixture.threadId),
		}));
		expect(state.message).toMatchObject({
			direction: "outbound",
			authoredByMemberId: fixture.memberId,
			integrationId: fixture.integrationId,
			from: {
				address: "replies@verified.example",
				name: "Support",
			},
			to: [{ address: "reply-to@example.com", name: "Replies" }],
			subject: "Re: Need help",
			textBody: "A plain-text reply.",
			inReplyTo: "<inbound@example.com>",
			references: [
				"<oldest@example.com>",
				"<older@example.com>",
				"<inbound@example.com>",
			],
		});
		expect(state.message).not.toHaveProperty("senderContactId");
		expect(state.message).not.toHaveProperty("externalMessageId");
		expect(state.send).toMatchObject({
			messageId: queued.messageId,
			requestedByMemberId: fixture.memberId,
			clientRequestId: "request-1",
			status: "queued",
			generation: 0,
			attemptCount: 0,
			workId: expect.any(String),
		});
		expect(state.secondActorSend).toMatchObject({
			requestedByMemberId: fixture.secondMemberId,
			clientRequestId: "request-1",
		});
		expect(state.otherSend).toMatchObject({
			requestedByMemberId: fixture.otherMemberId,
			clientRequestId: "request-1",
		});
		expect(state.drafts).toEqual([]);
		expect(state.thread).toMatchObject({
			latestMessageId: secondActorQueued.messageId,
			isUnread: false,
		});
		if (state.message?.direction !== "outbound") {
			throw new Error("Expected an outbound message");
		}
		expect(createResendSendRequest(state.message)).toEqual({
			payload: {
				from: '"Support" <replies@verified.example>',
				to: ['"Replies" <reply-to@example.com>'],
				subject: "Re: Need help",
				text: "A plain-text reply.",
				headers: {
					"In-Reply-To": "<inbound@example.com>",
					References:
						"<oldest@example.com> <older@example.com> <inbound@example.com>",
				},
				tags: [
					{
						name: "merimoar_message_id",
						value: queued.messageId,
					},
				],
			},
			options: {
				idempotencyKey: `merimoar-email-${queued.messageId}`,
			},
		});
	});

	it("falls back to the inbound sender and rejects replying to the inbox itself", async () => {
		const fixture = await createFixture();
		await fixture.base.run(async (ctx) => {
			await ctx.db.patch(fixture.inboundMessageId, { replyTo: [] });
		});
		const queued = await saveAndQueue(fixture);
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(queued.messageId)),
		).toMatchObject({ to: [{ address: "customer@example.com" }] });

		const second = await createFixture();
		await second.base.run(async (ctx) => {
			await ctx.db.patch(second.inboundMessageId, {
				replyTo: [{ address: "support@merimoar.test" }],
			});
		});
		const draft = await second.actor.mutation(api.email.outbound.saveDraft, {
			threadId: second.threadId,
			body: "Should not send.",
		});
		await expectErrorCode(
			second.actor.mutation(api.email.outbound.queueReply, {
				threadId: second.threadId,
				draftRevision: draft.revision,
				clientRequestId: "self-addressed",
			}),
			"EMAIL_REPLY_RECIPIENT_INVALID",
		);

		const outboundOnlyThreadId = await second.base.run(async (ctx) => {
			const threadId = await ctx.db.insert("emailThreads", {
				organizationId: second.organizationId,
				inboxId: second.inboxId,
				lastActivityAt: 2_000,
			});
			await ctx.db.insert("emailMessages", {
				inboxId: second.inboxId,
				integrationId: second.integrationId,
				threadId,
				direction: "outbound",
				authoredByMemberId: second.memberId,
				from: { address: "support@merimoar.test" },
				to: [{ address: "customer@example.com" }],
				cc: [],
				bcc: [],
				replyTo: [],
				references: [],
				subject: "Re: Existing",
				textBody: "Already sent",
				sentAt: 2_000,
			});
			return threadId;
		});
		const outboundOnlyDraft = await second.actor.mutation(
			api.email.outbound.saveDraft,
			{
				threadId: outboundOnlyThreadId,
				body: "Do not reply to ourselves.",
			},
		);
		await expectErrorCode(
			second.actor.mutation(api.email.outbound.queueReply, {
				threadId: outboundOnlyThreadId,
				draftRevision: outboundOnlyDraft.revision,
				clientRequestId: "outbound-only",
			}),
			"EMAIL_REPLY_TARGET_NOT_FOUND",
		);
	});

	it("enforces organization, route ownership, configuration, and connection state", async () => {
		expect.hasAssertions();
		const fixture = await createFixture();
		await expectErrorCode(
			fixture.otherActor.mutation(api.email.outbound.saveDraft, {
				threadId: fixture.threadId,
				body: "Cross tenant",
			}),
			"EMAIL_THREAD_NOT_FOUND",
		);

		await fixture.base.run(async (ctx) => {
			await ctx.db.patch(fixture.inboxId, {
				outbound: undefined,
			});
		});
		let draft = await fixture.actor.mutation(api.email.outbound.saveDraft, {
			threadId: fixture.threadId,
			body: "Unconfigured",
		});
		await expectErrorCode(
			fixture.actor.mutation(api.email.outbound.queueReply, {
				threadId: fixture.threadId,
				draftRevision: draft.revision,
				clientRequestId: "unconfigured",
			}),
			"EMAIL_OUTBOUND_NOT_CONFIGURED",
		);

		await fixture.base.run(async (ctx) => {
			await ctx.db.patch(fixture.inboxId, {
				outbound: {
					integrationId: fixture.integrationId,
					address: "replies@verified.example",
				},
			});
			await ctx.db.patch(fixture.integrationId, {
				status: "needs_reauthorization",
			});
		});
		await expectErrorCode(
			fixture.actor.mutation(api.email.outbound.queueReply, {
				threadId: fixture.threadId,
				draftRevision: draft.revision,
				clientRequestId: "disconnected",
			}),
			"EMAIL_INTEGRATION_NOT_CONNECTED",
		);

		const otherIntegrationId = await createConnectedResendIntegration(
			fixture.base,
			fixture.otherOrganizationId,
			"other",
		);
		await fixture.base.run(async (ctx) => {
			await ctx.db.patch(fixture.integrationId, { status: "connected" });
			await ctx.db.patch(fixture.inboxId, {
				outbound: {
					integrationId: otherIntegrationId,
					address: "replies@verified.example",
				},
			});
		});
		draft = await fixture.actor.mutation(api.email.outbound.saveDraft, {
			threadId: fixture.threadId,
			body: "Corrupt route",
			expectedRevision: draft.revision,
		});
		await expectErrorCode(
			fixture.actor.mutation(api.email.outbound.queueReply, {
				threadId: fixture.threadId,
				draftRevision: draft.revision,
				clientRequestId: "wrong-org-integration",
			}),
			"EMAIL_OUTBOUND_ROUTE_INVALID",
		);
	});

	it("keeps inbox selection across disablement and prevents stale draft writes and sends", async () => {
		const fixture = await createFixture();
		const first = await fixture.actor.mutation(api.email.outbound.saveDraft, {
			threadId: fixture.threadId,
			body: "First",
		});
		const second = await fixture.actor.mutation(api.email.outbound.saveDraft, {
			threadId: fixture.threadId,
			body: "Second",
			expectedRevision: first.revision,
		});
		await expectErrorCode(
			fixture.actor.mutation(api.email.outbound.saveDraft, {
				threadId: fixture.threadId,
				body: "Stale",
				expectedRevision: first.revision,
			}),
			"EMAIL_DRAFT_STALE_REVISION",
		);
		await expectErrorCode(
			fixture.actor.mutation(api.email.outbound.queueReply, {
				threadId: fixture.threadId,
				draftRevision: first.revision,
				clientRequestId: "stale-send",
			}),
			"EMAIL_DRAFT_STALE_REVISION",
		);

		await fixture.actor.mutation(api.email.inboxes.remove, {
			inboxId: fixture.inboxId,
		});
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(fixture.inboxId)),
		).toMatchObject({
			status: "disabled",
			outbound: {
				integrationId: fixture.integrationId,
				address: "replies@verified.example",
			},
		});
		await expectErrorCode(
			fixture.actor.mutation(api.email.outbound.queueReply, {
				threadId: fixture.threadId,
				draftRevision: second.revision,
				clientRequestId: "disabled",
			}),
			"EMAIL_ROUTE_INACTIVE",
		);
	});

	it("retries canceled and pre-provider failures without a provider window", async () => {
		const canceled = await createFixture();
		const canceledQueued = await saveAndQueue(canceled, "canceled");
		const canceledWorkId = await requireWorkId(canceled, canceledQueued);
		await canceled.base.mutation(
			internal.email.outboundQueue.completeOutboundWork,
			{
				workId: canceledWorkId,
				context: { sendId: canceledQueued.sendId, generation: 0 },
				result: { kind: "canceled" },
			},
		);
		expect(
			await canceled.base.run(async (ctx) => ctx.db.get(canceledQueued.sendId)),
		).toMatchObject({
			status: "failed",
			failure: { kind: "before_provider", reason: "work_canceled" },
		});
		await canceled.actor.mutation(api.email.outbound.retryFailedSend, {
			messageId: canceledQueued.messageId,
		});

		const workerFailed = await createFixture();
		const workerQueued = await saveAndQueue(workerFailed, "worker-failed");
		await prepareSendAttempt(workerFailed, workerQueued);
		const workerWorkId = await requireWorkId(workerFailed, workerQueued);
		await workerFailed.base.mutation(
			internal.email.outboundQueue.completeOutboundWork,
			{
				workId: workerWorkId,
				context: { sendId: workerQueued.sendId, generation: 0 },
				result: { kind: "failed", error: "Worker stopped" },
			},
		);
		expect(
			await workerFailed.base.run(async (ctx) =>
				ctx.db.get(workerQueued.sendId),
			),
		).toMatchObject({
			status: "failed",
			failure: { kind: "before_provider", reason: "worker_failed" },
		});
		await workerFailed.actor.mutation(api.email.outbound.retryFailedSend, {
			messageId: workerQueued.messageId,
		});

		const accessFailure = await createFixture();
		const accessQueued = await saveAndQueue(accessFailure, "access-failure");
		await prepareSendAttempt(accessFailure, accessQueued);
		await accessFailure.base.mutation(
			internal.email.outbound.recordTerminalFailure,
			{
				sendId: accessQueued.sendId,
				generation: 0,
				failure: {
					kind: "before_provider",
					reason: "access_unavailable",
					message: "WorkOS token lookup failed.",
				},
			},
		);
		await accessFailure.actor.mutation(api.email.outbound.retryFailedSend, {
			messageId: accessQueued.messageId,
		});

		for (const [fixture, sendId] of [
			[canceled, canceledQueued.sendId],
			[workerFailed, workerQueued.sendId],
			[accessFailure, accessQueued.sendId],
		] as const) {
			expect(
				await fixture.base.run(async (ctx) => ctx.db.get(sendId)),
			).toMatchObject({
				status: "queued",
				generation: 1,
				workId: expect.any(String),
			});
		}
	});

	it("recovers routes and guards known, expired, and ambiguous provider outcomes", async () => {
		const route = await createFixture();
		const routeQueued = await saveAndQueue(route, "route-recovery");
		await route.base.run(async (ctx) => {
			await ctx.db.patch(route.integrationId, {
				status: "needs_reauthorization",
			});
		});
		expect(await prepareSendAttempt(route, routeQueued)).toBeNull();
		await route.base.run(async (ctx) => {
			await ctx.db.patch(route.integrationId, { status: "connected" });
		});
		await route.actor.mutation(api.email.outbound.retryFailedSend, {
			messageId: routeQueued.messageId,
		});
		expect(await prepareSendAttempt(route, routeQueued, 1)).not.toBeNull();

		const rejected = await createFixture();
		const rejectedQueued = await saveAndQueue(rejected, "known-rejection");
		const claims = await Promise.all([
			prepareSendAttempt(rejected, rejectedQueued),
			prepareSendAttempt(rejected, rejectedQueued),
		]);
		expect(claims.filter(Boolean)).toHaveLength(1);
		await beginProviderCall(rejected, rejectedQueued);
		await rejected.base.mutation(
			internal.email.outbound.recordTerminalFailure,
			{
				sendId: rejectedQueued.sendId,
				generation: 0,
				failure: {
					kind: "provider_rejected",
					reason: "configuration",
					message: "Sender domain is not verified.",
				},
			},
		);
		await rejected.actor.mutation(api.email.outbound.retryFailedSend, {
			messageId: rejectedQueued.messageId,
		});

		const expired = await createFixture();
		const expiredQueued = await saveAndQueue(expired, "expired-rejection");
		await prepareSendAttempt(expired, expiredQueued);
		await beginProviderCall(expired, expiredQueued);
		await expired.base.mutation(internal.email.outbound.recordTerminalFailure, {
			sendId: expiredQueued.sendId,
			generation: 0,
			failure: {
				kind: "provider_rejected",
				reason: "transient",
				message: "Rate limited.",
			},
		});
		const expiresAt = await expired.base.run(
			async (ctx) =>
				(await ctx.db.get(expiredQueued.sendId))?.idempotencyExpiresAt,
		);
		if (expiresAt === undefined) {
			throw new Error("Expected a provider idempotency deadline");
		}
		const now = vi.spyOn(Date, "now").mockReturnValue(expiresAt);
		try {
			await expectErrorCode(
				expired.actor.mutation(api.email.outbound.retryFailedSend, {
					messageId: expiredQueued.messageId,
				}),
				"EMAIL_SEND_RETRY_WINDOW_EXPIRED",
			);
		} finally {
			now.mockRestore();
		}

		const ambiguous = await createFixture();
		const ambiguousQueued = await saveAndQueue(ambiguous, "ambiguous");
		await prepareSendAttempt(ambiguous, ambiguousQueued);
		await beginProviderCall(ambiguous, ambiguousQueued);
		const ambiguousWorkId = await requireWorkId(ambiguous, ambiguousQueued);
		await ambiguous.base.mutation(
			internal.email.outboundQueue.completeOutboundWork,
			{
				workId: ambiguousWorkId,
				context: { sendId: ambiguousQueued.sendId, generation: 0 },
				result: { kind: "failed", error: "Connection timed out" },
			},
		);
		await expectErrorCode(
			ambiguous.actor.mutation(api.email.outbound.retryFailedSend, {
				messageId: ambiguousQueued.messageId,
			}),
			"EMAIL_SEND_NOT_RETRYABLE",
		);
	});

	it("treats an external provider ID as reconcile-only", async () => {
		const fixture = await createFixture();
		const queued = await saveAndQueue(fixture, "reconcile-only");
		await fixture.base.run(async (ctx) => {
			await ctx.db.patch(queued.messageId, {
				externalMessageId: "already-accepted-id",
			});
			await ctx.db.patch(fixture.integrationId, { status: "disconnected" });
		});
		expect(await prepareSendAttempt(fixture, queued)).toMatchObject({
			message: { externalMessageId: "already-accepted-id" },
		});
		await fixture.base.mutation(
			internal.email.outbound.establishProviderAcceptance,
			{
				sendId: queued.sendId,
				messageId: queued.messageId,
				externalMessageId: "already-accepted-id",
				acceptedAt: 2_000,
			},
		);
		await fixture.base.mutation(internal.email.outbound.recordTerminalFailure, {
			sendId: queued.sendId,
			generation: 0,
			failure: {
				kind: "permanent",
				message: "Metadata lookup failed.",
			},
		});
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(queued.sendId)),
		).toMatchObject({ status: "sent", acceptedAt: 2_000 });
	});

	it("handles email.sent idempotently, enriches IDs write-once, and appends one linked-case event", async () => {
		const fixture = await createFixture();
		const queued = await saveAndQueue(fixture);
		const caseId = await fixture.base.run(async (ctx) => {
			const caseId = await ctx.db.insert("cases", {
				organizationId: fixture.organizationId,
				reference: "CASE-EMAIL",
				title: "Email case",
				description: "",
				ownerMemberId: null,
				dueAt: null,
				status: "open",
				lastActivityAt: 1,
				createdAt: 1,
				updatedAt: 1,
			});
			await ctx.db.insert("caseEmailThreadRelations", {
				caseId,
				threadId: fixture.threadId,
				startedAt: 1,
				endedAt: null,
				linkedByMemberId: fixture.memberId,
				unlinkedByMemberId: null,
			});
			return caseId;
		});
		await prepareSendAttempt(fixture, queued);
		await beginProviderCall(fixture, queued);
		await fixture.base.mutation(internal.email.outbound.recordTerminalFailure, {
			sendId: queued.sendId,
			generation: 0,
			failure: {
				kind: "ambiguous",
				message: "Timeout",
			},
		});

		const webhookArgs = {
			integrationId: fixture.integrationId,
			messageId: queued.messageId as string,
			externalMessageId: "resend-webhook-id",
			internetMessageId: "<rfc-message-id@example.com>",
			acceptedAt: 3_000,
		};
		expect(
			await fixture.base.mutation(
				internal.email.outbound.acceptResendSentWebhook,
				webhookArgs,
			),
		).toEqual({
			status: "accepted",
			messageId: queued.messageId,
			needsMetadata: false,
		});
		await fixture.base.mutation(
			internal.email.outbound.acceptResendSentWebhook,
			webhookArgs,
		);
		await expect(
			fixture.base.mutation(internal.email.outbound.acceptResendSentWebhook, {
				...webhookArgs,
				externalMessageId: "different-provider-id",
			}),
		).rejects.toThrow("cannot change");
		await expect(
			fixture.base.mutation(internal.email.outbound.acceptResendSentWebhook, {
				...webhookArgs,
				internetMessageId: "<different@example.com>",
			}),
		).rejects.toThrow("cannot change");
		await fixture.base.mutation(
			internal.email.outbound.enrichInternetMessageId,
			{
				messageId: queued.messageId,
				integrationId: fixture.integrationId,
				externalMessageId: "resend-webhook-id",
				internetMessageId: "<rfc-message-id@example.com>",
			},
		);
		await expect(
			fixture.base.mutation(internal.email.outbound.enrichInternetMessageId, {
				messageId: queued.messageId,
				integrationId: fixture.integrationId,
				externalMessageId: "resend-webhook-id",
				internetMessageId: "<different@example.com>",
			}),
		).rejects.toThrow("cannot change");

		expect(
			await fixture.base.mutation(
				internal.email.outbound.acceptResendSentWebhook,
				{
					...webhookArgs,
					integrationId: fixture.otherIntegrationId,
				},
			),
		).toEqual({ status: "ignored" });

		const legacy = await createFixture();
		const legacyQueued = await saveAndQueue(legacy, "legacy-webhook");
		expect(
			await legacy.base.mutation(
				internal.email.outbound.acceptResendSentWebhook,
				{
					integrationId: legacy.integrationId,
					messageId: legacyQueued.messageId as string,
					externalMessageId: "legacy-provider-id",
					acceptedAt: 4_000,
				},
			),
		).toEqual({
			status: "accepted",
			messageId: legacyQueued.messageId,
			needsMetadata: true,
		});
		expect(
			await legacy.base.run(async (ctx) => ctx.db.get(legacyQueued.sendId)),
		).toMatchObject({ status: "sent", acceptedAt: 4_000 });

		const state = await fixture.base.run(async (ctx) => ({
			message: await ctx.db.get(queued.messageId),
			send: await ctx.db.get(queued.sendId),
			events: await ctx.db
				.query("caseEvents")
				.withIndex("by_case_id_and_email_message_id", (index) =>
					index.eq("caseId", caseId).eq("emailMessageId", queued.messageId),
				)
				.collect(),
			caseRecord: await ctx.db.get(caseId),
		}));
		expect(state.message).toMatchObject({
			externalMessageId: "resend-webhook-id",
			internetMessageId: "<rfc-message-id@example.com>",
		});
		expect(state.send).toMatchObject({ status: "sent", acceptedAt: 3_000 });
		expect(state.events).toHaveLength(1);
		expect(state.events[0]).toMatchObject({
			type: "outbound_email",
			emailMessageId: queued.messageId,
			createdByMemberId: fixture.memberId,
		});
		expect(state.caseRecord?.lastActivityAt).toBe(state.message?.sentAt);
	});

	it("returns the latest 100 messages chronologically with outbound send status", async () => {
		const fixture = await createFixture();
		const queued = await saveAndQueue(fixture);
		await fixture.base.run(async (ctx) => {
			const replyTarget = await ctx.db.get(fixture.inboundMessageId);
			if (!replyTarget || replyTarget.direction !== "inbound") {
				throw new Error("Expected the inbound reply target");
			}
			for (let index = 0; index < 100; index += 1) {
				await ctx.db.insert("emailMessages", {
					inboxId: replyTarget.inboxId,
					integrationId: replyTarget.integrationId,
					threadId: replyTarget.threadId,
					direction: "inbound",
					senderContactId: replyTarget.senderContactId,
					externalMessageId: `older-provider-id-${index}`,
					internetMessageId: `<older-${index}@example.com>`,
					references: [],
					from: replyTarget.from,
					to: replyTarget.to,
					cc: [],
					bcc: [],
					replyTo: [],
					subject: "Older message",
					textBody: "Older message.",
					sentAt: index,
					receivedAt: index,
				});
			}
		});
		const thread = await fixture.actor.query(api.email.reader.getThread, {
			threadId: fixture.threadId,
		});
		expect(thread?.messages).toHaveLength(100);
		expect(thread?.messages[0]).toMatchObject({
			direction: "inbound",
			sentAt: 2,
		});
		expect(thread?.messages.at(-1)).toMatchObject({
			_id: queued.messageId,
			direction: "outbound",
			authoredByMemberId: fixture.memberId,
		});
		expect(thread?.sendStatuses).toEqual([
			{
				messageId: queued.messageId,
				status: "queued",
				failure: undefined,
			},
		]);
	});
});
