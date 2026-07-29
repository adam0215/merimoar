import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation, mutation } from "../_generated/server";
import { requireActor } from "../auth/access";
import { getActiveCaseRelationForEmailThread } from "../case/emailRelations";
import { appendOutboundEmailCaseEvent } from "../case/events";
import { type EmailSendFailure, emailSendFailureValidator } from "./model";
import {
	createReplySubject,
	createReplyThreading,
	isReservedNonDeliverableAddress,
	selectReplyRecipient,
} from "./outboundModel";
import { emailOutboundPool } from "./outboundQueue";
import { setThreadUnread } from "./unreadCounts";

const PROVIDER_IDEMPOTENCY_WINDOW_MS = 23 * 60 * 60 * 1_000;

function getProviderIdempotencyExpiry(
	send: Doc<"emailSends">,
	failure: EmailSendFailure,
) {
	return failure.kind === "provider_rejected" && failure.reason === "transient"
		? (send.idempotencyExpiresAt ?? Date.now() + PROVIDER_IDEMPOTENCY_WINDOW_MS)
		: send.idempotencyExpiresAt;
}

function throwDomainError(code: string, message: string): never {
	throw new ConvexError({ code, message });
}

async function requireOwnedThread(
	ctx: MutationCtx,
	threadId: Id<"emailThreads">,
	organizationId: Id<"organizations">,
) {
	const thread = await ctx.db.get(threadId);
	if (!thread || thread.organizationId !== organizationId) {
		throwDomainError(
			"EMAIL_THREAD_NOT_FOUND",
			"The email thread could not be found.",
		);
	}
	return thread;
}

async function findLatestInboundMessage(
	ctx: MutationCtx,
	threadId: Id<"emailThreads">,
) {
	const message = await ctx.db
		.query("emailMessages")
		.withIndex("by_thread_id_and_direction_and_sent_at", (index) =>
			index.eq("threadId", threadId).eq("direction", "inbound"),
		)
		.order("desc")
		.first();
	return message?.direction === "inbound" ? message : null;
}

async function enqueueSendWork(
	ctx: MutationCtx,
	sendId: Id<"emailSends">,
	messageId: Id<"emailMessages">,
	generation: number,
) {
	const workId = await emailOutboundPool.enqueueAction(
		ctx,
		internal.email.outboundWorker.processOutboundEmail,
		{ sendId, messageId, generation },
		{
			onComplete: internal.email.outboundQueue.completeOutboundWork,
			context: { sendId, generation },
		},
	);
	await ctx.db.patch(sendId, { workId });
}

export const saveDraft = mutation({
	args: {
		threadId: v.id("emailThreads"),
		body: v.string(),
		expectedRevision: v.optional(v.number()),
	},
	returns: v.object({
		draftId: v.id("emailDrafts"),
		revision: v.number(),
	}),
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		await requireOwnedThread(ctx, args.threadId, workspace.organization._id);
		const existing = await ctx.db
			.query("emailDrafts")
			.withIndex("by_thread_id_and_author_member_id", (index) =>
				index
					.eq("threadId", args.threadId)
					.eq("authorMemberId", workspace.member._id),
			)
			.unique();

		if (existing) {
			if (args.expectedRevision !== existing.revision) {
				throwDomainError(
					"EMAIL_DRAFT_STALE_REVISION",
					"The draft changed elsewhere. Reload it before saving.",
				);
			}
			const revision = existing.revision + 1;
			await ctx.db.patch(existing._id, {
				body: args.body,
				revision,
				updatedAt: Date.now(),
			});
			return { draftId: existing._id, revision };
		}
		if (args.expectedRevision !== undefined && args.expectedRevision !== 0) {
			throwDomainError(
				"EMAIL_DRAFT_STALE_REVISION",
				"The draft changed elsewhere. Reload it before saving.",
			);
		}

		const draftId = await ctx.db.insert("emailDrafts", {
			threadId: args.threadId,
			authorMemberId: workspace.member._id,
			body: args.body,
			revision: 1,
			updatedAt: Date.now(),
		});
		return { draftId, revision: 1 };
	},
});

export const queueReply = mutation({
	args: {
		threadId: v.id("emailThreads"),
		draftRevision: v.number(),
		clientRequestId: v.string(),
	},
	returns: v.object({
		messageId: v.id("emailMessages"),
		sendId: v.id("emailSends"),
		deduplicated: v.boolean(),
	}),
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		const existingSend = await ctx.db
			.query("emailSends")
			.withIndex("by_requested_by_member_id_and_client_request_id", (index) =>
				index
					.eq("requestedByMemberId", workspace.member._id)
					.eq("clientRequestId", args.clientRequestId),
			)
			.unique();
		if (existingSend) {
			const existingMessage = await ctx.db.get(existingSend.messageId);
			const existingThread = existingMessage
				? await ctx.db.get(existingMessage.threadId)
				: null;
			if (
				!existingMessage ||
				!existingThread ||
				existingThread.organizationId !== workspace.organization._id ||
				existingThread._id !== args.threadId
			) {
				throwDomainError(
					"EMAIL_CLIENT_REQUEST_ID_CONFLICT",
					"This email request identifier is already in use.",
				);
			}
			return {
				messageId: existingMessage._id,
				sendId: existingSend._id,
				deduplicated: true,
			};
		}

		const thread = await requireOwnedThread(
			ctx,
			args.threadId,
			workspace.organization._id,
		);
		const inbox = await ctx.db.get(thread.inboxId);
		if (
			!inbox ||
			inbox.organizationId !== workspace.organization._id ||
			inbox.status !== "active"
		) {
			throwDomainError(
				"EMAIL_ROUTE_INACTIVE",
				"The email inbox is not active.",
			);
		}
		const outbound = inbox.outbound;
		if (!outbound) {
			throwDomainError(
				"EMAIL_OUTBOUND_NOT_CONFIGURED",
				"Choose an outbound email integration and address for this inbox.",
			);
		}
		const integration = await ctx.db.get(outbound.integrationId);
		if (
			!integration ||
			integration.organizationId !== workspace.organization._id
		) {
			throwDomainError(
				"EMAIL_OUTBOUND_ROUTE_INVALID",
				"The outbound email integration does not belong to this inbox organization.",
			);
		}
		if (integration.status !== "connected") {
			throwDomainError(
				"EMAIL_INTEGRATION_NOT_CONNECTED",
				"Reconnect the outbound email integration before sending.",
			);
		}

		const draft = await ctx.db
			.query("emailDrafts")
			.withIndex("by_thread_id_and_author_member_id", (index) =>
				index
					.eq("threadId", thread._id)
					.eq("authorMemberId", workspace.member._id),
			)
			.unique();
		if (!draft) {
			throwDomainError(
				"EMAIL_DRAFT_NOT_FOUND",
				"The email draft was not found.",
			);
		}
		if (draft.revision !== args.draftRevision) {
			throwDomainError(
				"EMAIL_DRAFT_STALE_REVISION",
				"The draft changed elsewhere. Reload it before sending.",
			);
		}
		if (!draft.body.trim()) {
			throwDomainError("EMAIL_DRAFT_EMPTY", "Write a reply before sending.");
		}

		const replyTarget = await findLatestInboundMessage(ctx, thread._id);
		if (!replyTarget) {
			throwDomainError(
				"EMAIL_REPLY_TARGET_NOT_FOUND",
				"The thread has no inbound email to reply to.",
			);
		}
		const recipient = selectReplyRecipient(replyTarget, inbox.address);
		if (!recipient) {
			throwDomainError(
				"EMAIL_REPLY_RECIPIENT_INVALID",
				"The reply would be addressed to the inbox itself.",
			);
		}
		if (isReservedNonDeliverableAddress(recipient.address)) {
			throwDomainError(
				"EMAIL_RECIPIENT_NON_DELIVERABLE",
				"Replies to reserved demo addresses cannot be sent.",
			);
		}
		const threading = createReplyThreading(replyTarget);
		const queuedAt = Date.now();
		const messageId = await ctx.db.insert("emailMessages", {
			inboxId: inbox._id,
			integrationId: integration._id,
			threadId: thread._id,
			direction: "outbound",
			authoredByMemberId: workspace.member._id,
			from: { address: outbound.address, name: inbox.displayName },
			to: [recipient],
			cc: [],
			bcc: [],
			replyTo: [],
			subject: createReplySubject(replyTarget.subject),
			textBody: draft.body,
			sentAt: queuedAt,
			...threading,
		});
		const sendId = await ctx.db.insert("emailSends", {
			messageId,
			requestedByMemberId: workspace.member._id,
			clientRequestId: args.clientRequestId,
			status: "queued",
			generation: 0,
			attemptCount: 0,
		});
		await ctx.db.delete(draft._id);
		await ctx.db.patch(thread._id, {
			latestMessageId: messageId,
			lastActivityAt: queuedAt,
		});
		await setThreadUnread(ctx, thread, false);
		await enqueueSendWork(ctx, sendId, messageId, 0);
		return { messageId, sendId, deduplicated: false };
	},
});

export const retryFailedSend = mutation({
	args: { messageId: v.id("emailMessages") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		const message = await ctx.db.get(args.messageId);
		if (!message || message.direction !== "outbound") {
			throwDomainError("EMAIL_MESSAGE_NOT_FOUND", "The email was not found.");
		}
		await requireOwnedThread(ctx, message.threadId, workspace.organization._id);
		const send = await ctx.db
			.query("emailSends")
			.withIndex("by_message_id", (index) => index.eq("messageId", message._id))
			.unique();
		if (
			!send ||
			send.status !== "failed" ||
			!send.failure ||
			send.failure.kind === "ambiguous" ||
			send.failure.kind === "permanent"
		) {
			throwDomainError(
				"EMAIL_SEND_NOT_RETRYABLE",
				"This email cannot be retried safely.",
			);
		}
		if (
			send.idempotencyExpiresAt !== undefined &&
			Date.now() >= send.idempotencyExpiresAt
		) {
			throwDomainError(
				"EMAIL_SEND_RETRY_WINDOW_EXPIRED",
				"The provider idempotency window has expired, so this email cannot be retried safely.",
			);
		}
		const generation = send.generation + 1;
		await ctx.db.patch(send._id, {
			status: "queued",
			generation,
			workId: undefined,
			failure: undefined,
			providerCallGeneration: undefined,
		});
		await enqueueSendWork(ctx, send._id, message._id, generation);
		return null;
	},
});

export const prepareSendAttempt = internalMutation({
	args: {
		sendId: v.id("emailSends"),
		messageId: v.id("emailMessages"),
		generation: v.number(),
	},
	handler: async (ctx, args) => {
		const send = await ctx.db.get(args.sendId);
		const message = await ctx.db.get(args.messageId);
		if (
			!send ||
			!message ||
			message.direction !== "outbound" ||
			send.messageId !== message._id ||
			send.generation !== args.generation ||
			send.status !== "queued"
		) {
			return null;
		}
		if (
			send.idempotencyExpiresAt !== undefined &&
			Date.now() >= send.idempotencyExpiresAt
		) {
			await ctx.db.patch(send._id, {
				status: "failed",
				failure: {
					kind: "permanent",
					message:
						"The provider idempotency window expired before this email could be retried safely.",
				},
			});
			return null;
		}
		const [thread, inbox, integration] = await Promise.all([
			ctx.db.get(message.threadId),
			ctx.db.get(message.inboxId),
			ctx.db.get(message.integrationId),
		]);
		if (
			!thread ||
			!inbox ||
			!integration ||
			thread.inboxId !== inbox._id ||
			inbox.organizationId !== thread.organizationId ||
			integration.organizationId !== thread.organizationId
		) {
			await ctx.db.patch(send._id, {
				status: "failed",
				failure: {
					kind: "before_provider",
					reason: "configuration",
					message: "The outbound email route is invalid.",
				},
			});
			return null;
		}
		if (
			[...message.to, ...message.cc, ...message.bcc].some((recipient) =>
				isReservedNonDeliverableAddress(recipient.address),
			)
		) {
			await ctx.db.patch(send._id, {
				status: "failed",
				failure: {
					kind: "permanent",
					message: "Replies to reserved demo addresses cannot be sent.",
				},
			});
			return null;
		}
		if (
			!message.externalMessageId &&
			(inbox.status !== "active" || integration.status !== "connected")
		) {
			await ctx.db.patch(send._id, {
				status: "failed",
				failure: {
					kind: "before_provider",
					reason: "route_inactive",
					message: "The inbox or outbound integration is not active.",
				},
			});
			return null;
		}

		const attemptedAt = Date.now();
		await ctx.db.patch(send._id, {
			status: "sending",
			attemptCount: send.attemptCount + 1,
			lastAttemptAt: attemptedAt,
			failure: undefined,
			providerCallGeneration: undefined,
		});
		return { message, integration };
	},
});

export const beginProviderCall = internalMutation({
	args: {
		sendId: v.id("emailSends"),
		messageId: v.id("emailMessages"),
		generation: v.number(),
	},
	returns: v.boolean(),
	handler: async (ctx, args) => {
		const [send, message] = await Promise.all([
			ctx.db.get(args.sendId),
			ctx.db.get(args.messageId),
		]);
		if (
			!send ||
			!message ||
			message.direction !== "outbound" ||
			message.externalMessageId !== undefined ||
			send.messageId !== message._id ||
			send.generation !== args.generation ||
			send.status !== "sending"
		) {
			return false;
		}
		await ctx.db.patch(send._id, {
			providerCallGeneration: args.generation,
		});
		return true;
	},
});

export const recordKnownRetryableFailure = internalMutation({
	args: {
		sendId: v.id("emailSends"),
		generation: v.number(),
		failure: emailSendFailureValidator,
	},
	returns: v.boolean(),
	handler: async (ctx, args) => {
		const send = await ctx.db.get(args.sendId);
		if (
			!send ||
			send.generation !== args.generation ||
			send.status !== "sending" ||
			(args.failure.kind !== "before_provider" &&
				!(
					args.failure.kind === "provider_rejected" &&
					args.failure.reason === "transient"
				))
		) {
			return false;
		}
		await ctx.db.patch(send._id, {
			status: "queued",
			failure: args.failure,
			idempotencyExpiresAt: getProviderIdempotencyExpiry(send, args.failure),
		});
		return true;
	},
});

export const recordTerminalFailure = internalMutation({
	args: {
		sendId: v.id("emailSends"),
		generation: v.number(),
		failure: emailSendFailureValidator,
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const send = await ctx.db.get(args.sendId);
		if (send && send.generation === args.generation && send.status !== "sent") {
			await ctx.db.patch(send._id, {
				status: "failed",
				failure: args.failure,
				idempotencyExpiresAt: getProviderIdempotencyExpiry(send, args.failure),
			});
		}
		return null;
	},
});

async function establishProviderAcceptanceInTransaction(
	ctx: MutationCtx,
	args: {
		messageId: Id<"emailMessages">;
		sendId: Id<"emailSends">;
		externalMessageId: string;
		internetMessageId?: string;
		acceptedAt: number;
	},
) {
	const [message, send] = await Promise.all([
		ctx.db.get(args.messageId),
		ctx.db.get(args.sendId),
	]);
	if (
		!message ||
		message.direction !== "outbound" ||
		!send ||
		send.messageId !== message._id
	) {
		return false;
	}
	if (
		message.externalMessageId !== undefined &&
		message.externalMessageId !== args.externalMessageId
	) {
		throw new Error("Outbound provider message ID cannot change");
	}
	if (
		args.internetMessageId !== undefined &&
		message.internetMessageId !== undefined &&
		message.internetMessageId !== args.internetMessageId
	) {
		throw new Error("Outbound Internet Message-ID cannot change");
	}
	const internetMessageId = message.internetMessageId ?? args.internetMessageId;
	if (
		message.externalMessageId === undefined ||
		(message.internetMessageId === undefined && internetMessageId !== undefined)
	) {
		await ctx.db.patch(message._id, {
			externalMessageId: args.externalMessageId,
			internetMessageId,
		});
	}
	if (send.status === "sent") {
		return true;
	}
	await ctx.db.patch(send._id, {
		status: "sent",
		acceptedAt: send.acceptedAt ?? args.acceptedAt,
		failure: undefined,
	});

	const activeCaseRelation = await getActiveCaseRelationForEmailThread(
		ctx,
		message.threadId,
	);
	if (activeCaseRelation) {
		const caseRecord = await ctx.db.get(activeCaseRelation.caseId);
		const thread = await ctx.db.get(message.threadId);
		if (
			!caseRecord ||
			!thread ||
			caseRecord.organizationId !== thread.organizationId
		) {
			throw new Error("Email thread has an invalid active case relation");
		}
		await appendOutboundEmailCaseEvent(
			ctx,
			caseRecord,
			message._id,
			message.authoredByMemberId,
			message.sentAt,
		);
	}
	return true;
}

export const establishProviderAcceptance = internalMutation({
	args: {
		messageId: v.id("emailMessages"),
		sendId: v.id("emailSends"),
		externalMessageId: v.string(),
		internetMessageId: v.optional(v.string()),
		acceptedAt: v.number(),
	},
	returns: v.boolean(),
	handler: async (ctx, args) => {
		return await establishProviderAcceptanceInTransaction(ctx, args);
	},
});

export const enrichInternetMessageId = internalMutation({
	args: {
		messageId: v.id("emailMessages"),
		integrationId: v.id("emailIntegrations"),
		externalMessageId: v.string(),
		internetMessageId: v.string(),
	},
	returns: v.boolean(),
	handler: async (ctx, args) => {
		const message = await ctx.db.get(args.messageId);
		if (
			!message ||
			message.direction !== "outbound" ||
			message.integrationId !== args.integrationId ||
			message.externalMessageId !== args.externalMessageId
		) {
			return false;
		}
		if (
			message.internetMessageId !== undefined &&
			message.internetMessageId !== args.internetMessageId
		) {
			throw new Error("Outbound Internet Message-ID cannot change");
		}
		if (!message.internetMessageId) {
			await ctx.db.patch(message._id, {
				internetMessageId: args.internetMessageId,
			});
		}
		return true;
	},
});

export const acceptResendSentWebhook = internalMutation({
	args: {
		integrationId: v.id("emailIntegrations"),
		messageId: v.string(),
		externalMessageId: v.string(),
		internetMessageId: v.optional(v.string()),
		acceptedAt: v.number(),
	},
	returns: v.union(
		v.object({
			status: v.literal("accepted"),
			messageId: v.id("emailMessages"),
			needsMetadata: v.boolean(),
		}),
		v.object({ status: v.literal("ignored") }),
	),
	handler: async (ctx, args) => {
		const messageId = ctx.db.normalizeId("emailMessages", args.messageId);
		if (!messageId) {
			return { status: "ignored" as const };
		}
		const message = await ctx.db.get(messageId);
		if (
			!message ||
			message.direction !== "outbound" ||
			message.integrationId !== args.integrationId
		) {
			return { status: "ignored" as const };
		}
		const [integration, inbox, thread, send] = await Promise.all([
			ctx.db.get(args.integrationId),
			ctx.db.get(message.inboxId),
			ctx.db.get(message.threadId),
			ctx.db
				.query("emailSends")
				.withIndex("by_message_id", (index) =>
					index.eq("messageId", message._id),
				)
				.unique(),
		]);
		if (
			!integration ||
			!inbox ||
			!thread ||
			!send ||
			integration.organizationId !== thread.organizationId ||
			inbox.organizationId !== thread.organizationId ||
			thread.inboxId !== inbox._id
		) {
			return { status: "ignored" as const };
		}
		const accepted = await establishProviderAcceptanceInTransaction(ctx, {
			messageId: message._id,
			sendId: send._id,
			externalMessageId: args.externalMessageId,
			internetMessageId: args.internetMessageId,
			acceptedAt: args.acceptedAt,
		});
		const acceptedMessage = accepted ? await ctx.db.get(message._id) : null;
		return accepted
			? {
					status: "accepted" as const,
					messageId: message._id,
					needsMetadata: acceptedMessage?.internetMessageId === undefined,
				}
			: { status: "ignored" as const };
	},
});
