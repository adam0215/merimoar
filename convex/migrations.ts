import { Migrations } from "@convex-dev/migrations";
import { paginationOptsValidator } from "convex/server";
import { components, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { extractIngestRecipientsFromRawPayload } from "./email/ingestRecipients";
import schema from "./schema";

const migrations = new Migrations(components.migrations, {
	schema,
	internalMutation,
	defaultBatchSize: 5,
});

type BackfilledStatus = Exclude<
	Doc<"emailIngestEvents">["status"],
	"ignored" | "pending"
>;

export function getBackfilledEmailIngestState(
	event: Doc<"emailIngestEvents">,
): {
	status: BackfilledStatus;
	processedAt?: number;
	error?: string;
	failureKind?: Doc<"emailIngestEvents">["failureKind"];
	replayCount: number;
	processingGeneration: number;
} {
	switch (event.status) {
		case "pending":
			return {
				status: "failed",
				error: "Email ingest was pending during the replay migration",
				failureKind: "unknown",
				replayCount: event.replayCount ?? 0,
				processingGeneration: event.processingGeneration ?? 0,
			};
		case "ignored":
			return {
				status: "processed",
				processedAt: event.processedAt ?? event.receivedAt,
				error: undefined,
				failureKind: undefined,
				replayCount: event.replayCount ?? 0,
				processingGeneration: event.processingGeneration ?? 0,
			};
		case "failed":
			if (!event.connectionId) {
				return {
					status: "unroutable",
					error: event.error ?? "No active connection matched the recipient",
					failureKind: "unroutable",
					replayCount: event.replayCount ?? 0,
					processingGeneration: event.processingGeneration ?? 0,
				};
			}
			return {
				status: "failed",
				processedAt: event.processedAt,
				error: event.error,
				failureKind: event.failureKind ?? "unknown",
				replayCount: event.replayCount ?? 0,
				processingGeneration: event.processingGeneration ?? 0,
			};
		default:
			return {
				status: event.status,
				processedAt: event.processedAt,
				error: event.error,
				failureKind: event.failureKind,
				replayCount: event.replayCount ?? 0,
				processingGeneration: event.processingGeneration ?? 0,
			};
	}
}

export const backfillEmailIngestReplayState = migrations.define({
	table: "emailIngestEvents",
	migrateOne: async (ctx, event) => {
		const nextState = getBackfilledEmailIngestState(event);
		const recipientAddresses = extractIngestRecipientsFromRawPayload(
			event.rawPayload,
		);

		for (const address of recipientAddresses) {
			const existingRecipient = await ctx.db
				.query("emailIngestRecipients")
				.withIndex("by_event_id_and_address", (index) =>
					index.eq("eventId", event._id).eq("address", address),
				)
				.first();
			if (existingRecipient) {
				await ctx.db.patch(existingRecipient._id, {
					status: nextState.status,
					receivedAt: event.receivedAt,
				});
			} else {
				await ctx.db.insert("emailIngestRecipients", {
					eventId: event._id,
					address,
					status: nextState.status,
					receivedAt: event.receivedAt,
				});
			}
		}

		await ctx.db.patch(event._id, nextState);
	},
});

export const getEmailIngestReplayMigrationStatus = internalQuery({
	args: {},
	handler: async (ctx) => {
		const [status] = await migrations.getStatus(ctx, {
			migrations: [internal.migrations.backfillEmailIngestReplayState],
		});
		return status ?? null;
	},
});

export const verifyEmailIngestReplayState = internalQuery({
	args: { paginationOpts: paginationOptsValidator },
	handler: async (ctx, args) => {
		const result = await ctx.db
			.query("emailIngestEvents")
			.paginate(args.paginationOpts);
		const page = await Promise.all(
			result.page.map(async (event) => {
				const expectedRecipients = extractIngestRecipientsFromRawPayload(
					event.rawPayload,
				);
				const storedRecipients = await ctx.db
					.query("emailIngestRecipients")
					.withIndex("by_event_id_and_address", (index) =>
						index.eq("eventId", event._id),
					)
					.take(101);
				const storedAddresses = new Set(
					storedRecipients.map((recipient) => recipient.address),
				);
				const legacyStatus =
					event.status === "pending" || event.status === "ignored";
				const missingRecipientCount = expectedRecipients.filter(
					(address) => !storedAddresses.has(address),
				).length;
				const recipientStateMismatch = storedRecipients.some(
					(recipient) => recipient.status !== event.status,
				);

				return {
					eventId: event._id,
					complete:
						!legacyStatus &&
						event.replayCount !== undefined &&
						event.processingGeneration !== undefined &&
						missingRecipientCount === 0 &&
						!recipientStateMismatch,
					legacyStatus,
					missingRecipientCount,
					recipientStateMismatch,
				};
			}),
		);

		return { ...result, page };
	},
});
