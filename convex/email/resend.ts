"use node";

import { convert } from "html-to-text";
import { Resend } from "resend";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { env, internalAction } from "../_generated/server";
import { normalizeResendEmail } from "./normalize";

export const processInboundEmail = internalAction({
	args: {
		eventId: v.id("emailIngestEvents"),
		attempt: v.number(),
	},
	handler: async (ctx, args): Promise<null> => {
		const ingestContext = await ctx.runQuery(
			internal.email.ingest.getIngestContext,
			{ eventId: args.eventId },
		);
		if (!ingestContext) {
			return null;
		}
		if (!env.RESEND_API_KEY) {
			throw new Error("RESEND_API_KEY is not configured");
		}

		try {
			const resend = new Resend(env.RESEND_API_KEY);
			const { data, error } = await resend.emails.receiving.get(
				ingestContext.event.externalMessageId,
			);
			if (error || !data) {
				throw new Error(error?.message ?? "Resend returned no email");
			}

			const email = normalizeResendEmail(data, (html) =>
				convert(html, {
					wordwrap: false,
					selectors: [{ selector: "img", format: "skip" }],
				}),
			);
			await ctx.runMutation(
				internal.email.ingest.storeInboundEmail,
				{
					eventId: args.eventId,
					email,
				},
			);
			return null;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown Resend error";
			await ctx.runMutation(
				internal.email.ingest.recordProcessingFailure,
				{
					eventId: args.eventId,
					error: message,
					attempt: args.attempt,
				},
			);
			return null;
		}
	},
});
