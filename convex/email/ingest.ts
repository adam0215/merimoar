import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { upsertSenderContact } from "../contact/model";
import { emailIngestPool } from "./ingestQueue";
import { selectIngestRecipientAddresses } from "./ingestRecipients";
import { updateIngestRecipientStatuses } from "./ingestState";
import {
	emailIngestFailureKindValidator,
	normalizedInboundEmailValidator,
} from "./model";

async function findConnection(ctx: MutationCtx, recipientAddresses: string[]) {
	for (const recipientAddress of recipientAddresses) {
		const connection = await ctx.db
			.query("emailConnections")
			.withIndex("by_address", (query) => query.eq("address", recipientAddress))
			.unique();

		if (connection?.status === "active") {
			return connection;
		}
	}

	return null;
}

async function findThreadByInternetMessageId(
	ctx: MutationCtx,
	connectionId: Id<"emailConnections">,
	internetMessageId: string,
) {
	const message = await ctx.db
		.query("emailMessages")
		.withIndex("by_connection_id_and_internet_message_id", (query) =>
			query
				.eq("connectionId", connectionId)
				.eq("internetMessageId", internetMessageId),
		)
		.unique();
	return message ? await ctx.db.get(message.threadId) : null;
}

async function findThreadByExternalThreadId(
	ctx: MutationCtx,
	connectionId: Id<"emailConnections">,
	externalThreadId: string,
) {
	return await ctx.db
		.query("emailThreads")
		.withIndex("by_connection_id_and_external_thread_id", (query) =>
			query
				.eq("connectionId", connectionId)
				.eq("externalThreadId", externalThreadId),
		)
		.unique();
}

async function findExistingMessage(
	ctx: MutationCtx,
	connectionId: Id<"emailConnections">,
	externalMessageId: string,
) {
	return await ctx.db
		.query("emailMessages")
		.withIndex("by_connection_id_and_external_message_id", (query) =>
			query
				.eq("connectionId", connectionId)
				.eq("externalMessageId", externalMessageId),
		)
		.unique();
}

export const recordResendEvent = internalMutation({
	args: {
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
			.withIndex("by_external_event_id", (query) =>
				query.eq("externalEventId", args.externalEventId),
			)
			.unique();

		if (existing) {
			return { status: "duplicate" as const, eventId: existing._id };
		}

		const recipientAddresses = selectIngestRecipientAddresses(args);
		const connection = await findConnection(ctx, recipientAddresses);
		const eventId = await ctx.db.insert("emailIngestEvents", {
			connectionId: connection?._id,
			externalEventId: args.externalEventId,
			externalMessageId: args.externalMessageId,
			eventType: args.eventType,
			status: connection ? "queued" : "unroutable",
			rawPayload: args.rawPayload,
			receivedAt: args.receivedAt,
			error: connection
				? undefined
				: "No active connection matched the recipient",
			failureKind: connection ? undefined : "unroutable",
			attempts: 0,
			replayCount: 0,
			processingGeneration: 0,
		});
		await Promise.all(
			recipientAddresses.map((address) =>
				ctx.db.insert("emailIngestRecipients", {
					eventId,
					address,
					status: connection ? "queued" : "unroutable",
					receivedAt: args.receivedAt,
				}),
			),
		);

		if (!connection) {
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
			!event?.connectionId ||
			event.status !== "queued" ||
			(event.processingGeneration ?? 0) !== args.processingGeneration
		) {
			return null;
		}

		const connection = await ctx.db.get(event.connectionId);
		if (!connection || connection.status !== "active") {
			await ctx.db.patch(event._id, {
				status: "failed",
				error: "The email connection is not active",
				failureKind: "connection",
			});
			await updateIngestRecipientStatuses(ctx, event._id, "failed");
			return null;
		}

		await ctx.db.patch(event._id, {
			attempts: event.attempts + 1,
		});
		return { event, connection };
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
		if (!event?.connectionId) {
			throw new Error("Ingest event is not connected to an inbox");
		}
		if (event.status === "processed") {
			return await findExistingMessage(
				ctx,
				event.connectionId,
				args.email.externalMessageId,
			).then((message) => message?._id ?? null);
		}
		if (
			event.status !== "queued" ||
			(event.processingGeneration ?? 0) !== args.processingGeneration
		) {
			return null;
		}

		const connection = await ctx.db.get(event.connectionId);
		if (!connection) {
			throw new Error("Email connection not found");
		}

		const existingMessage = await findExistingMessage(
			ctx,
			event.connectionId,
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
			connection.organizationId,
			args.email.from,
			args.email.receivedAt,
		);

		let thread = args.email.externalThreadId
			? await findThreadByExternalThreadId(
					ctx,
					event.connectionId,
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
					event.connectionId,
					internetMessageId,
				);
				if (thread) {
					break;
				}
			}
		}

		if (!thread) {
			const threadId = await ctx.db.insert("emailThreads", {
				connectionId: event.connectionId,
				externalThreadId: args.email.externalThreadId,
				lastActivityAt: args.email.receivedAt,
			});
			thread = await ctx.db.get(threadId);
		}

		if (!thread) {
			throw new Error("Could not create email thread");
		}

		const messageId = await ctx.db.insert("emailMessages", {
			connectionId: event.connectionId,
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

		if (
			!thread.latestMessageId ||
			args.email.receivedAt >= thread.lastActivityAt
		) {
			await ctx.db.patch(thread._id, {
				latestMessageId: messageId,
				lastActivityAt: args.email.receivedAt,
			});
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
