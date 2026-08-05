"use node";

import { v } from "convex/values";
import { convert } from "html-to-text";
import { Resend } from "resend";
import {
	classifyResendRetrievalError,
	createNonRetryableIngestError,
	isResendAuthorizationError,
} from "#/email/ingestErrors";
import { normalizeResendEmail } from "#/email/normalize";
import { fetchResendAccess } from "#/email/resendAccess";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";

async function failPermanently(
	ctx: ActionCtx,
	args: {
		eventId: Doc<"emailIngestEvents">["_id"];
		processingGeneration: number;
		failureKind: NonNullable<Doc<"emailIngestEvents">["failureKind"]>;
		message: string;
		cause?: unknown;
	},
): Promise<never> {
	let recordingFailure: unknown;
	try {
		await ctx.runMutation(
			internal.email.ingest.recordTerminalProcessingFailure,
			{
				eventId: args.eventId,
				error: args.message,
				failureKind: args.failureKind,
				processingGeneration: args.processingGeneration,
			},
		);
	} catch (cause) {
		recordingFailure = cause;
	}
	throw createNonRetryableIngestError(
		args.failureKind,
		args.message,
		args.cause ?? recordingFailure,
	);
}

export const processInboundEmail = internalAction({
	args: {
		eventId: v.id("emailIngestEvents"),
		processingGeneration: v.number(),
	},
	handler: async (ctx, args): Promise<null> => {
		const ingestContext = await ctx.runMutation(
			internal.email.ingest.prepareProcessingAttempt,
			{
				eventId: args.eventId,
				processingGeneration: args.processingGeneration,
			},
		);
		if (!ingestContext) {
			return null;
		}

		const access = await fetchResendAccess(ingestContext.integration);
		if (!access.active) {
			if (access.error !== "missing_required_scope") {
				await ctx.runMutation(
					internal.email.integrations.recordWorkosAccessFailure,
					{
						integrationId: ingestContext.integration.integrationId,
						expectedConnectedAccountId:
							ingestContext.integration.connectedAccountId,
						expectedWorkosUpdatedAt: ingestContext.integration.workosUpdatedAt,
						error: access.error,
					},
				);
			}
			return await failPermanently(ctx, {
				...args,
				failureKind:
					access.error === "missing_required_scope"
						? "configuration"
						: "route_inactive",
				message:
					access.error === "missing_required_scope"
						? "Resend must grant the full_access scope"
						: "The Resend account must be reauthorized",
			});
		}

		const resend = new Resend(access.token);
		const { data, error } = await resend.emails.receiving.get(
			ingestContext.event.externalMessageId,
		);
		if (error) {
			const classification = classifyResendRetrievalError(error);
			if (classification.retryable) {
				throw new Error("Resend is temporarily unavailable");
			}
			if (isResendAuthorizationError(error)) {
				await ctx.runMutation(
					internal.email.integrations.recordWorkosAccessFailure,
					{
						integrationId: ingestContext.integration.integrationId,
						expectedConnectedAccountId:
							ingestContext.integration.connectedAccountId,
						expectedWorkosUpdatedAt: ingestContext.integration.workosUpdatedAt,
						error: "needs_reauthorization",
					},
				);
			}
			return await failPermanently(ctx, {
				...args,
				failureKind: classification.failureKind,
				message:
					classification.failureKind === "configuration"
						? "Email ingest authentication was rejected"
						: "Resend rejected the email lookup",
				cause: error,
			});
		}
		if (!data) {
			return await failPermanently(ctx, {
				...args,
				failureKind: "unknown",
				message: "Resend returned no email data",
			});
		}

		const email = await (async () => {
			try {
				return normalizeResendEmail(data, (html) =>
					convert(html, {
						wordwrap: false,
						selectors: [{ selector: "img", format: "skip" }],
					}),
				);
			} catch (cause) {
				return await failPermanently(ctx, {
					...args,
					failureKind: "unknown",
					message: "Email normalization failed",
					cause,
				});
			}
		})();
		try {
			await ctx.runMutation(internal.email.ingest.storeInboundEmail, {
				eventId: args.eventId,
				processingGeneration: args.processingGeneration,
				email,
			});
		} catch (cause) {
			return await failPermanently(ctx, {
				...args,
				failureKind: "unknown",
				message: "Email storage failed",
				cause,
			});
		}
		return null;
	},
});
