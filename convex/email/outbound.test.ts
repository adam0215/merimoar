import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import {
	createConnectedResendIntegration,
	createTest,
	syncWorkosUser,
} from "../test.setup";
import { readResendInternetMessageId } from "./outboundModel";
import {
	classifyResendSendError,
	createResendSendRequest,
} from "./outboundProvider";

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
		});
		const otherInboxId = await ctx.db.insert("emailInboxes", {
			organizationId: otherOrganizationId,
			displayName: "Other",
			address: "support@other.test",
			status: "active",
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
		await ctx.db.patch(ids.inboxId, { outboundIntegrationId: integrationId });
		await ctx.db.patch(ids.otherInboxId, {
			outboundIntegrationId: otherIntegrationId,
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

function expectErrorCode(error: unknown, code: string) {
	expect(error).toBeInstanceOf(ConvexError);
	expect((error as ConvexError<{ code: string }>).data.code).toBe(code);
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
		await expect(
			fixture.actor.mutation(api.email.outbound.queueReply, {
				threadId: conflictingThreadId,
				draftRevision: 1,
				clientRequestId: "request-1",
			}),
		).rejects.toSatisfy((error) => {
			expectErrorCode(error, "EMAIL_CLIENT_REQUEST_ID_CONFLICT");
			return true;
		});

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
				address: "support@merimoar.test",
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
				from: '"Support" <support@merimoar.test>',
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
		await expect(
			second.actor.mutation(api.email.outbound.queueReply, {
				threadId: second.threadId,
				draftRevision: draft.revision,
				clientRequestId: "self-addressed",
			}),
		).rejects.toSatisfy((error) => {
			expectErrorCode(error, "EMAIL_REPLY_RECIPIENT_INVALID");
			return true;
		});

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
		await expect(
			second.actor.mutation(api.email.outbound.queueReply, {
				threadId: outboundOnlyThreadId,
				draftRevision: outboundOnlyDraft.revision,
				clientRequestId: "outbound-only",
			}),
		).rejects.toSatisfy((error) => {
			expectErrorCode(error, "EMAIL_REPLY_TARGET_NOT_FOUND");
			return true;
		});
	});

	it("enforces organization, route ownership, configuration, and connection state", async () => {
		const fixture = await createFixture();
		await expect(
			fixture.otherActor.mutation(api.email.outbound.saveDraft, {
				threadId: fixture.threadId,
				body: "Cross tenant",
			}),
		).rejects.toSatisfy((error) => {
			expectErrorCode(error, "EMAIL_THREAD_NOT_FOUND");
			return true;
		});

		await fixture.base.run(async (ctx) => {
			await ctx.db.patch(fixture.inboxId, {
				outboundIntegrationId: undefined,
			});
		});
		let draft = await fixture.actor.mutation(api.email.outbound.saveDraft, {
			threadId: fixture.threadId,
			body: "Unconfigured",
		});
		await expect(
			fixture.actor.mutation(api.email.outbound.queueReply, {
				threadId: fixture.threadId,
				draftRevision: draft.revision,
				clientRequestId: "unconfigured",
			}),
		).rejects.toSatisfy((error) => {
			expectErrorCode(error, "EMAIL_OUTBOUND_NOT_CONFIGURED");
			return true;
		});

		await fixture.base.run(async (ctx) => {
			await ctx.db.patch(fixture.inboxId, {
				outboundIntegrationId: fixture.integrationId,
			});
			await ctx.db.patch(fixture.integrationId, {
				status: "needs_reauthorization",
			});
		});
		await expect(
			fixture.actor.mutation(api.email.outbound.queueReply, {
				threadId: fixture.threadId,
				draftRevision: draft.revision,
				clientRequestId: "disconnected",
			}),
		).rejects.toSatisfy((error) => {
			expectErrorCode(error, "EMAIL_INTEGRATION_NOT_CONNECTED");
			return true;
		});

		const otherIntegrationId = await createConnectedResendIntegration(
			fixture.base,
			fixture.otherOrganizationId,
			"other",
		);
		await fixture.base.run(async (ctx) => {
			await ctx.db.patch(fixture.integrationId, { status: "connected" });
			await ctx.db.patch(fixture.inboxId, {
				outboundIntegrationId: otherIntegrationId,
			});
		});
		draft = await fixture.actor.mutation(api.email.outbound.saveDraft, {
			threadId: fixture.threadId,
			body: "Corrupt route",
			expectedRevision: draft.revision,
		});
		await expect(
			fixture.actor.mutation(api.email.outbound.queueReply, {
				threadId: fixture.threadId,
				draftRevision: draft.revision,
				clientRequestId: "wrong-org-integration",
			}),
		).rejects.toSatisfy((error) => {
			expectErrorCode(error, "EMAIL_OUTBOUND_ROUTE_INVALID");
			return true;
		});
	});

	it("keeps inbox selection across disablement and prevents stale draft writes and sends", async () => {
		const fixture = await createFixture();
		await fixture.actor.mutation(api.email.inboxes.setOutboundIntegration, {
			inboxId: fixture.inboxId,
			integrationId: fixture.integrationId,
		});
		const first = await fixture.actor.mutation(api.email.outbound.saveDraft, {
			threadId: fixture.threadId,
			body: "First",
		});
		const second = await fixture.actor.mutation(api.email.outbound.saveDraft, {
			threadId: fixture.threadId,
			body: "Second",
			expectedRevision: first.revision,
		});
		await expect(
			fixture.actor.mutation(api.email.outbound.saveDraft, {
				threadId: fixture.threadId,
				body: "Stale",
				expectedRevision: first.revision,
			}),
		).rejects.toSatisfy((error) => {
			expectErrorCode(error, "EMAIL_DRAFT_STALE_REVISION");
			return true;
		});
		await expect(
			fixture.actor.mutation(api.email.outbound.queueReply, {
				threadId: fixture.threadId,
				draftRevision: first.revision,
				clientRequestId: "stale-send",
			}),
		).rejects.toSatisfy((error) => {
			expectErrorCode(error, "EMAIL_DRAFT_STALE_REVISION");
			return true;
		});

		await fixture.actor.mutation(api.email.inboxes.remove, {
			inboxId: fixture.inboxId,
		});
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(fixture.inboxId)),
		).toMatchObject({
			status: "disabled",
			outboundIntegrationId: fixture.integrationId,
		});
		await expect(
			fixture.actor.mutation(api.email.outbound.queueReply, {
				threadId: fixture.threadId,
				draftRevision: second.revision,
				clientRequestId: "disabled",
			}),
		).rejects.toSatisfy((error) => {
			expectErrorCode(error, "EMAIL_ROUTE_INACTIVE");
			return true;
		});
	});

	it("retries canceled and pre-provider failures without a provider window", async () => {
		const canceled = await createFixture();
		const canceledQueued = await saveAndQueue(canceled, "canceled");
		const canceledWorkId = await canceled.base.run(
			async (ctx) => (await ctx.db.get(canceledQueued.sendId))?.workId,
		);
		if (!canceledWorkId) {
			throw new Error("Expected queued work");
		}
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
		await workerFailed.base.mutation(
			internal.email.outbound.prepareSendAttempt,
			{
				sendId: workerQueued.sendId,
				messageId: workerQueued.messageId,
				generation: 0,
			},
		);
		const workerWorkId = await workerFailed.base.run(
			async (ctx) => (await ctx.db.get(workerQueued.sendId))?.workId,
		);
		if (!workerWorkId) {
			throw new Error("Expected claimed work");
		}
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
		await accessFailure.base.mutation(
			internal.email.outbound.prepareSendAttempt,
			{
				sendId: accessQueued.sendId,
				messageId: accessQueued.messageId,
				generation: 0,
			},
		);
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
		expect(
			await route.base.mutation(internal.email.outbound.prepareSendAttempt, {
				sendId: routeQueued.sendId,
				messageId: routeQueued.messageId,
				generation: 0,
			}),
		).toBeNull();
		await route.base.run(async (ctx) => {
			await ctx.db.patch(route.integrationId, { status: "connected" });
		});
		await route.actor.mutation(api.email.outbound.retryFailedSend, {
			messageId: routeQueued.messageId,
		});
		expect(
			await route.base.mutation(internal.email.outbound.prepareSendAttempt, {
				sendId: routeQueued.sendId,
				messageId: routeQueued.messageId,
				generation: 1,
			}),
		).not.toBeNull();

		const rejected = await createFixture();
		const rejectedQueued = await saveAndQueue(rejected, "known-rejection");
		const claims = await Promise.all([
			rejected.base.mutation(internal.email.outbound.prepareSendAttempt, {
				sendId: rejectedQueued.sendId,
				messageId: rejectedQueued.messageId,
				generation: 0,
			}),
			rejected.base.mutation(internal.email.outbound.prepareSendAttempt, {
				sendId: rejectedQueued.sendId,
				messageId: rejectedQueued.messageId,
				generation: 0,
			}),
		]);
		expect(claims.filter(Boolean)).toHaveLength(1);
		await rejected.base.mutation(internal.email.outbound.beginProviderCall, {
			sendId: rejectedQueued.sendId,
			messageId: rejectedQueued.messageId,
			generation: 0,
		});
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
		await expired.base.mutation(internal.email.outbound.prepareSendAttempt, {
			sendId: expiredQueued.sendId,
			messageId: expiredQueued.messageId,
			generation: 0,
		});
		await expired.base.mutation(internal.email.outbound.beginProviderCall, {
			sendId: expiredQueued.sendId,
			messageId: expiredQueued.messageId,
			generation: 0,
		});
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
			await expect(
				expired.actor.mutation(api.email.outbound.retryFailedSend, {
					messageId: expiredQueued.messageId,
				}),
			).rejects.toSatisfy((error) => {
				expectErrorCode(error, "EMAIL_SEND_RETRY_WINDOW_EXPIRED");
				return true;
			});
		} finally {
			now.mockRestore();
		}

		const ambiguous = await createFixture();
		const ambiguousQueued = await saveAndQueue(ambiguous, "ambiguous");
		await ambiguous.base.mutation(internal.email.outbound.prepareSendAttempt, {
			sendId: ambiguousQueued.sendId,
			messageId: ambiguousQueued.messageId,
			generation: 0,
		});
		await ambiguous.base.mutation(internal.email.outbound.beginProviderCall, {
			sendId: ambiguousQueued.sendId,
			messageId: ambiguousQueued.messageId,
			generation: 0,
		});
		const ambiguousWorkId = await ambiguous.base.run(
			async (ctx) => (await ctx.db.get(ambiguousQueued.sendId))?.workId,
		);
		if (!ambiguousWorkId) {
			throw new Error("Expected provider work");
		}
		await ambiguous.base.mutation(
			internal.email.outboundQueue.completeOutboundWork,
			{
				workId: ambiguousWorkId,
				context: { sendId: ambiguousQueued.sendId, generation: 0 },
				result: { kind: "failed", error: "Connection timed out" },
			},
		);
		await expect(
			ambiguous.actor.mutation(api.email.outbound.retryFailedSend, {
				messageId: ambiguousQueued.messageId,
			}),
		).rejects.toSatisfy((error) => {
			expectErrorCode(error, "EMAIL_SEND_NOT_RETRYABLE");
			return true;
		});
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
		expect(
			await fixture.base.mutation(internal.email.outbound.prepareSendAttempt, {
				sendId: queued.sendId,
				messageId: queued.messageId,
				generation: 0,
			}),
		).toMatchObject({
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
		await fixture.base.mutation(internal.email.outbound.prepareSendAttempt, {
			sendId: queued.sendId,
			messageId: queued.messageId,
			generation: 0,
		});
		await fixture.base.mutation(internal.email.outbound.beginProviderCall, {
			sendId: queued.sendId,
			messageId: queued.messageId,
			generation: 0,
		});
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
