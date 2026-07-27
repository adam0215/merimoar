import { Workpool } from "@convex-dev/workpool";
import { v } from "convex/values";
import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import { parseNonRetryableIngestError } from "./ingestErrors";
import { updateIngestRecipientStatuses } from "./ingestState";

export const emailIngestPool = new Workpool(components.emailIngestWorkpool, {
	maxParallelism: 10,
	retryActionsByDefault: true,
	defaultRetryBehavior: {
		maxAttempts: 4,
		initialBackoffMs: 15_000,
		base: 4,
	},
});

const emailIngestWorkContext = v.object({
	eventId: v.id("emailIngestEvents"),
	processingGeneration: v.number(),
});

export const completeEmailIngestWork = emailIngestPool.defineOnComplete<
	DataModel,
	typeof emailIngestWorkContext
>({
	context: emailIngestWorkContext,
	handler: async (ctx, { workId, context, result }) => {
		const event = await ctx.db.get(context.eventId);
		if (
			!event ||
			event.status !== "queued" ||
			(event.processingGeneration ?? 0) !== context.processingGeneration ||
			event.workId !== workId
		) {
			return;
		}

		const terminalFailure =
			result.kind === "failed"
				? parseNonRetryableIngestError(result.error)
				: null;
		await ctx.db.patch(event._id, {
			status: "failed",
			error:
				terminalFailure?.message ??
				(result.kind === "failed"
					? "Resend remained unavailable after retrying"
					: result.kind === "canceled"
						? "Email ingest work was canceled"
						: "Email ingest work completed without processing"),
			failureKind:
				terminalFailure?.failureKind ??
				(result.kind === "failed" ? "provider" : "unknown"),
		});
		await updateIngestRecipientStatuses(ctx, event._id, "failed");
	},
});
