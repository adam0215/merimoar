import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { getActiveCaseRelationForEmailThread } from "../case/emailRelations";
import { appendInboundEmailCaseEvent } from "../case/events";
import { upsertSenderContact } from "../contact/model";
import { emailIngestPool } from "./ingestQueue";
import { updateIngestRecipientStatuses } from "./ingestState";
import {
	emailIngestFailureKindValidator,
	normalizedInboundEmailValidator,
} from "./model";
import { routeEmailToOrganizationInbox } from "./router";
import { setThreadUnread } from "./unreadCounts";

async function findThreadByInternetMessageId(
	ctx: MutationCtx,
	inboxId: Id<"emailInboxes">,
	internetMessageId: string,
) {
	const message = await ctx.db
		.query("emailMessages")
		.withIndex("by_inbox_id_and_internet_message_id", (query) =>
			query.eq("inboxId", inboxId).eq("internetMessageId", internetMessageId),
		)
		.first();
	return message ? await ctx.db.get(message.threadId) : null;
}

async function findThreadByExternalThreadId(
	ctx: MutationCtx,
	inboxId: Id<"emailInboxes">,
	integrationId: Id<"emailIntegrations">,
	externalThreadId: string,
) {
	const reference = await ctx.db
		.query("emailThreadExternalReferences")
		.withIndex(
			"by_inbox_id_and_integration_id_and_external_thread_id",
			(query) =>
				query
					.eq("inboxId", inboxId)
					.eq("integrationId", integrationId)
					.eq("externalThreadId", externalThreadId),
		)
		.unique();
	return reference ? await ctx.db.get(reference.threadId) : null;
}

async function findExistingMessage(
	ctx: MutationCtx,
	inboxId: Id<"emailInboxes">,
	integrationId: Id<"emailIntegrations">,
	externalMessageId: string,
) {
	return await ctx.db
		.query("emailMessages")
		.withIndex(
			"by_inbox_id_and_integration_id_and_external_message_id",
			(query) =>
				query
					.eq("inboxId", inboxId)
					.eq("integrationId", integrationId)
					.eq("externalMessageId", externalMessageId),
		)
		.unique();
}

export const routeResendEvent = internalMutation({
	args: {
		integrationId: v.id("emailIntegrations"),
		externalEventId: v.string(),
		externalMessageId: v.string(),
		eventType: v.string(),
		receivedForAddresses: v.array(v.string()),
		toAddresses: v.array(v.string()),
		rawPayload: v.string(),
		receivedAt: v.number(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("emailIngestEvents")
			.withIndex("by_integration_id_and_external_event_id", (query) =>
				query
					.eq("integrationId", args.integrationId)
					.eq("externalEventId", args.externalEventId),
			)
			.unique();

		if (existing) {
			return { status: "duplicate" as const, eventId: existing._id };
		}

		const integration = await ctx.db.get(args.integrationId);
		if (!integration || integration.status !== "connected") {
			return { status: "ignored" as const };
		}
		const { inbox, recipientAddresses } = await routeEmailToOrganizationInbox(
			ctx,
			integration.organizationId,
			args,
		);
		const canRoute = inbox !== undefined;
		const eventId = await ctx.db.insert("emailIngestEvents", {
			inboxId: inbox?._id,
			integrationId: integration._id,
			externalEventId: args.externalEventId,
			externalMessageId: args.externalMessageId,
			eventType: args.eventType,
			status: canRoute ? "queued" : "unroutable",
			rawPayload: args.rawPayload,
			receivedAt: args.receivedAt,
			error: canRoute
				? undefined
				: "No active inbox matched the email recipients",
			failureKind: canRoute ? undefined : "unroutable",
			attempts: 0,
			replayCount: 0,
			processingGeneration: 0,
		});
		await Promise.all(
			recipientAddresses.map((address) =>
				ctx.db.insert("emailIngestRecipients", {
					eventId,
					address,
					status: canRoute ? "queued" : "unroutable",
					receivedAt: args.receivedAt,
				}),
			),
		);

		if (!canRoute) {
			return { status: "unroutable" as const, eventId };
		}

		const workId = await emailIngestPool.enqueueAction(
			ctx,
			internal.email.resend.processInboundEmail,
			{
				eventId,
				processingGeneration: 0,
			},
			{
				onComplete: internal.email.ingestQueue.completeEmailIngestWork,
				context: { eventId, processingGeneration: 0 },
			},
		);
		await ctx.db.patch(eventId, { workId });
		return { status: "accepted" as const, eventId };
	},
});

export const prepareProcessingAttempt = internalMutation({
	args: {
		eventId: v.id("emailIngestEvents"),
		processingGeneration: v.number(),
	},
	handler: async (ctx, args) => {
		const event = await ctx.db.get(args.eventId);
		if (
			!event?.inboxId ||
			!event.integrationId ||
			event.status !== "queued" ||
			(event.processingGeneration ?? 0) !== args.processingGeneration
		) {
			return null;
		}

		const [inbox, integration] = await Promise.all([
			ctx.db.get(event.inboxId),
			ctx.db.get(event.integrationId),
		]);
		if (
			!inbox ||
			inbox.status !== "active" ||
			!integration ||
			integration.status !== "connected"
		) {
			await ctx.db.patch(event._id, {
				status: "failed",
				error: "The email inbox or integration is not active",
				failureKind: "route_inactive",
			});
			await updateIngestRecipientStatuses(ctx, event._id, "failed");
			return null;
		}

		await ctx.db.patch(event._id, {
			attempts: event.attempts + 1,
		});
		return { event, inbox, integration };
	},
});

export const storeInboundEmail = internalMutation({
	args: {
		eventId: v.id("emailIngestEvents"),
		processingGeneration: v.number(),
		email: normalizedInboundEmailValidator,
	},
	handler: async (ctx, args) => {
		const event = await ctx.db.get(args.eventId);
		if (!event?.inboxId || !event.integrationId) {
			throw new Error("Ingest event is not connected to an inbox");
		}
		if (event.status === "processed") {
			return await findExistingMessage(
				ctx,
				event.inboxId,
				event.integrationId,
				args.email.externalMessageId,
			).then((message) => message?._id ?? null);
		}
		if (
			event.status !== "queued" ||
			(event.processingGeneration ?? 0) !== args.processingGeneration
		) {
			return null;
		}

		const inbox = await ctx.db.get(event.inboxId);
		if (!inbox) {
			throw new Error("Email inbox not found");
		}

		const existingMessage = await findExistingMessage(
			ctx,
			event.inboxId,
			event.integrationId,
			args.email.externalMessageId,
		);
		if (existingMessage) {
			await ctx.db.patch(event._id, {
				status: "processed",
				processedAt: Date.now(),
				error: undefined,
				failureKind: undefined,
			});
			await updateIngestRecipientStatuses(ctx, event._id, "processed");
			return existingMessage._id;
		}

		const senderContactId = await upsertSenderContact(
			ctx,
			inbox.organizationId,
			args.email.from,
			args.email.receivedAt,
		);

		let thread = args.email.externalThreadId
			? await findThreadByExternalThreadId(
					ctx,
					event.inboxId,
					event.integrationId,
					args.email.externalThreadId,
				)
			: null;

		if (!thread) {
			const replyCandidates = [
				...(args.email.inReplyTo ? [args.email.inReplyTo] : []),
				...[...args.email.references].reverse(),
			];

			for (const internetMessageId of replyCandidates) {
				thread = await findThreadByInternetMessageId(
					ctx,
					event.inboxId,
					internetMessageId,
				);
				if (thread) {
					break;
				}
			}
		}

		if (!thread) {
			const threadId = await ctx.db.insert("emailThreads", {
				organizationId: inbox.organizationId,
				inboxId: event.inboxId,
				lastActivityAt: args.email.receivedAt,
			});
			thread = await ctx.db.get(threadId);
		}

		if (!thread) {
			throw new Error("Could not create email thread");
		}

		if (args.email.externalThreadId) {
			const externalThreadId = args.email.externalThreadId;
			const inboxId = event.inboxId;
			const integrationId = event.integrationId;
			const existingReference = await ctx.db
				.query("emailThreadExternalReferences")
				.withIndex(
					"by_inbox_id_and_integration_id_and_external_thread_id",
					(query) =>
						query
							.eq("inboxId", inboxId)
							.eq("integrationId", integrationId)
							.eq("externalThreadId", externalThreadId),
				)
				.unique();
			if (!existingReference) {
				await ctx.db.insert("emailThreadExternalReferences", {
					threadId: thread._id,
					inboxId,
					integrationId,
					externalThreadId,
				});
			}
		}

		const messageId = await ctx.db.insert("emailMessages", {
			inboxId: event.inboxId,
			integrationId: event.integrationId,
			threadId: thread._id,
			senderContactId,
			externalMessageId: args.email.externalMessageId,
			internetMessageId: args.email.internetMessageId,
			inReplyTo: args.email.inReplyTo,
			references: args.email.references,
			direction: "inbound",
			from: args.email.from,
			to: args.email.to,
			cc: args.email.cc,
			bcc: args.email.bcc,
			replyTo: args.email.replyTo,
			subject: args.email.subject,
			textBody: args.email.textBody,
			sentAt: args.email.sentAt,
			receivedAt: args.email.receivedAt,
		});

		const isLatestMessage =
			!thread.latestMessageId || args.email.receivedAt >= thread.lastActivityAt;
		if (isLatestMessage) {
			await ctx.db.patch(thread._id, {
				latestMessageId: messageId,
				lastActivityAt: args.email.receivedAt,
			});
		}
		await setThreadUnread(ctx, thread, true);

		const activeCaseRelation = await getActiveCaseRelationForEmailThread(
			ctx,
			thread._id,
		);
		if (activeCaseRelation) {
			const caseRecord = await ctx.db.get(activeCaseRelation.caseId);
			if (!caseRecord || caseRecord.organizationId !== thread.organizationId) {
				throw new Error("Email thread has an invalid active case relation");
			}
			await appendInboundEmailCaseEvent(
				ctx,
				caseRecord,
				messageId,
				args.email.receivedAt,
			);
			await ctx.db.patch(caseRecord._id, { status: "needs_attention" });
		}

		await ctx.db.patch(event._id, {
			status: "processed",
			processedAt: Date.now(),
			error: undefined,
			failureKind: undefined,
		});
		await updateIngestRecipientStatuses(ctx, event._id, "processed");
		return messageId;
	},
});

export const recordTerminalProcessingFailure = internalMutation({
	args: {
		eventId: v.id("emailIngestEvents"),
		error: v.string(),
		failureKind: emailIngestFailureKindValidator,
		processingGeneration: v.number(),
	},
	handler: async (ctx, args) => {
		const event = await ctx.db.get(args.eventId);
		if (
			!event ||
			event.status !== "queued" ||
			(event.processingGeneration ?? 0) !== args.processingGeneration
		) {
			return null;
		}

		await ctx.db.patch(event._id, {
			status: "failed",
			error: args.error.slice(0, 500),
			failureKind: args.failureKind,
		});
		await updateIngestRecipientStatuses(ctx, event._id, "failed");
		return null;
	},
});
