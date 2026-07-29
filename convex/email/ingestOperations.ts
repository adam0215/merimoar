import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import { requireActor } from "../auth/access";
import { emailIngestPool } from "./ingestQueue";
import { updateIngestRecipientStatuses } from "./ingestState";

const MAX_EVENTS_PER_STATUS = 25;
const MAX_VISIBLE_FAILURES = 50;

function describeFailure(event: Doc<"emailIngestEvents">) {
	switch (event.failureKind) {
		case "unroutable":
			return "No inbox matched this recipient.";
		case "provider":
			return "Resend could not load this email.";
		case "configuration":
			return "Email ingest is not configured.";
		case "route_inactive":
			return "The email inbox or integration is inactive.";
		default:
			return "Email processing failed.";
	}
}

async function findOwnedInbox(
	ctx: QueryCtx | MutationCtx,
	inboxId: Doc<"emailInboxes">["_id"],
) {
	const actor = await requireActor(ctx);
	const inbox = await ctx.db.get(inboxId);
	return inbox?.organizationId === actor.organization._id ? inbox : null;
}

async function requireOwnedInbox(
	ctx: QueryCtx | MutationCtx,
	inboxId: Doc<"emailInboxes">["_id"],
) {
	const inbox = await findOwnedInbox(ctx, inboxId);
	if (!inbox) {
		throwFailedEventNotFound();
	}
	return inbox;
}

async function inboxCanProcessEvent(
	ctx: QueryCtx | MutationCtx,
	inbox: Doc<"emailInboxes">,
	event: Doc<"emailIngestEvents">,
) {
	if (inbox.status !== "active" || !event.integrationId) {
		return false;
	}
	const integration = await ctx.db.get(event.integrationId);
	return (
		integration?.organizationId === inbox.organizationId &&
		integration.status === "connected"
	);
}

export const listFailedEvents = query({
	args: {
		inboxId: v.id("emailInboxes"),
	},
	handler: async (ctx, args) => {
		const inbox = await findOwnedInbox(ctx, args.inboxId);
		if (!inbox) {
			return [];
		}
		const recipientRows = (
			await Promise.all(
				(["failed", "unroutable"] as const).map((status) =>
					ctx.db
						.query("emailIngestRecipients")
						.withIndex("by_address_and_status_and_received_at", (index) =>
							index.eq("address", inbox.address).eq("status", status),
						)
						.order("desc")
						.take(MAX_EVENTS_PER_STATUS),
				),
			)
		).flat();

		const failures = await Promise.all(
			recipientRows.map(async (recipient) => {
				const event = await ctx.db.get(recipient.eventId);
				if (
					!event ||
					(event.status !== "failed" && event.status !== "unroutable") ||
					(event.inboxId !== undefined && event.inboxId !== inbox._id)
				) {
					return null;
				}

				return {
					eventId: event._id,
					inboxId: inbox._id,
					status: event.status,
					receivedAt: event.receivedAt,
					attempts: event.attempts,
					replayCount: event.replayCount ?? 0,
					reason: describeFailure(event),
					canReplay: await inboxCanProcessEvent(ctx, inbox, event),
					inbox: {
						displayName: inbox.displayName,
						address: inbox.address,
						status: inbox.status,
					},
				};
			}),
		);

		return failures
			.filter((failure) => failure !== null)
			.sort((left, right) => right.receivedAt - left.receivedAt)
			.slice(0, MAX_VISIBLE_FAILURES);
	},
});

export const replayFailedEvent = mutation({
	args: {
		inboxId: v.id("emailInboxes"),
		eventId: v.id("emailIngestEvents"),
	},
	returns: v.union(
		v.object({ status: v.literal("queued") }),
		v.object({ status: v.literal("already_queued") }),
		v.object({ status: v.literal("already_processed") }),
	),
	handler: async (ctx, args) => {
		const inbox = await requireOwnedInbox(ctx, args.inboxId);
		const event = await ctx.db.get(args.eventId);
		const matchingRecipient = await ctx.db
			.query("emailIngestRecipients")
			.withIndex("by_event_id_and_address", (index) =>
				index.eq("eventId", args.eventId).eq("address", inbox.address),
			)
			.first();
		if (
			!event ||
			!matchingRecipient ||
			(event.inboxId !== undefined && event.inboxId !== inbox._id)
		) {
			throwFailedEventNotFound();
		}
		if (event.status === "processed") {
			return { status: "already_processed" as const };
		}
		if (event.status === "queued") {
			return { status: "already_queued" as const };
		}
		if (event.status !== "failed" && event.status !== "unroutable") {
			throwFailedEventNotFound();
		}
		if (!(await inboxCanProcessEvent(ctx, inbox, event))) {
			throw new ConvexError({
				code: "EMAIL_ROUTE_INACTIVE",
				message: "Activate the inbox and integration before retrying.",
			});
		}

		const processingGeneration = (event.processingGeneration ?? 0) + 1;
		await ctx.db.patch(event._id, {
			inboxId: inbox._id,
			status: "queued",
			error: undefined,
			failureKind: undefined,
			processedAt: undefined,
			replayCount: (event.replayCount ?? 0) + 1,
			processingGeneration,
		});
		await updateIngestRecipientStatuses(ctx, event._id, "queued");
		const workId = await emailIngestPool.enqueueAction(
			ctx,
			internal.email.resend.processInboundEmail,
			{
				eventId: event._id,
				processingGeneration,
			},
			{
				onComplete: internal.email.ingestQueue.completeEmailIngestWork,
				context: { eventId: event._id, processingGeneration },
			},
		);
		await ctx.db.patch(event._id, { workId });
		return { status: "queued" as const };
	},
});

function throwFailedEventNotFound(): never {
	throw new ConvexError({
		code: "EMAIL_INGEST_EVENT_NOT_FOUND",
		message: "The failed email could not be found.",
	});
}
