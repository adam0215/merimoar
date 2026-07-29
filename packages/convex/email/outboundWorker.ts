"use node";

import { v } from "convex/values";
import {
	ambiguousProviderOutcomeFailure,
	type EmailSendFailure,
} from "#/email/model";
import {
	connectOutboundEmailProvider,
	type OutboundEmailProvider,
} from "#/email/outboundProvider";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";

async function reconcileInternetMessageId(
	ctx: ActionCtx,
	messageId: Id<"emailMessages">,
	integrationId: Id<"emailIntegrations">,
	externalMessageId: string,
	provider: OutboundEmailProvider,
) {
	try {
		const internetMessageId =
			await provider.retrieveInternetMessageId(externalMessageId);
		if (internetMessageId) {
			await ctx.runMutation(internal.email.outbound.enrichInternetMessageId, {
				messageId,
				integrationId,
				externalMessageId,
				internetMessageId,
			});
		}
	} catch {
		// Provider acceptance is already durable. Metadata reconciliation must
		// never turn it into a failed send or cause another send attempt.
	}
}

export const processOutboundEmail = internalAction({
	args: {
		sendId: v.id("emailSends"),
		messageId: v.id("emailMessages"),
		generation: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		const context = await ctx.runMutation(
			internal.email.outbound.prepareSendAttempt,
			args,
		);
		if (!context) {
			return null;
		}

		if (context.message.externalMessageId) {
			await ctx.runMutation(
				internal.email.outbound.establishProviderAcceptance,
				{
					sendId: args.sendId,
					messageId: args.messageId,
					externalMessageId: context.message.externalMessageId,
					acceptedAt: Date.now(),
				},
			);
			try {
				const connection = await connectOutboundEmailProvider(
					context.integration,
				);
				if (connection.status === "ready") {
					await reconcileInternetMessageId(
						ctx,
						context.message._id,
						context.integration._id,
						context.message.externalMessageId,
						connection.provider,
					);
				}
			} catch {
				// Provider acceptance is already durable; metadata remains
				// eligible for later webhook reconciliation.
			}
			return null;
		}

		let connection: Awaited<ReturnType<typeof connectOutboundEmailProvider>>;
		try {
			connection = await connectOutboundEmailProvider(context.integration);
		} catch {
			await ctx.runMutation(
				internal.email.outbound.recordKnownRetryableFailure,
				{
					sendId: args.sendId,
					generation: args.generation,
					failure: {
						kind: "before_provider",
						reason: "access_unavailable",
						message: "Could not obtain an email provider access token.",
					},
				},
			);
			throw new Error("Email provider access is temporarily unavailable");
		}
		if (connection.status === "unavailable") {
			if (connection.reauthorizationRequired) {
				await ctx.runMutation(
					internal.email.integrations.markNeedsReauthorization,
					{
						integrationId: context.integration._id,
						expectedConnectedAccountUpdatedAt:
							context.integration.workosConnectedAccountUpdatedAt,
					},
				);
			}
			await ctx.runMutation(internal.email.outbound.recordTerminalFailure, {
				sendId: args.sendId,
				generation: args.generation,
				failure: connection.failure,
			});
			return null;
		}

		const provider = connection.provider;
		const canCallProvider = await ctx.runMutation(
			internal.email.outbound.beginProviderCall,
			args,
		);
		if (!canCallProvider) {
			return null;
		}
		let result: Awaited<ReturnType<typeof provider.send>>;
		try {
			result = await provider.send(context.message);
		} catch {
			await ctx.runMutation(internal.email.outbound.recordTerminalFailure, {
				sendId: args.sendId,
				generation: args.generation,
				failure: ambiguousProviderOutcomeFailure,
			});
			return null;
		}
		if (result.status === "rejected") {
			if (result.kind === "authorization") {
				await ctx.runMutation(
					internal.email.integrations.markNeedsReauthorization,
					{
						integrationId: context.integration._id,
						expectedConnectedAccountUpdatedAt:
							context.integration.workosConnectedAccountUpdatedAt,
					},
				);
			}
			if (result.kind === "transient") {
				await ctx.runMutation(
					internal.email.outbound.recordKnownRetryableFailure,
					{
						sendId: args.sendId,
						generation: args.generation,
						failure: {
							kind: "provider_rejected",
							reason: "transient",
							message: result.message,
						},
					},
				);
				throw new Error("Email provider temporarily rejected the send");
			}
			const failure: EmailSendFailure =
				result.kind === "permanent"
					? {
							kind: "permanent",
							message: result.message,
						}
					: {
							kind: "provider_rejected",
							reason: result.kind,
							message: result.message,
						};
			await ctx.runMutation(internal.email.outbound.recordTerminalFailure, {
				sendId: args.sendId,
				generation: args.generation,
				failure,
			});
			return null;
		}

		const accepted = await ctx.runMutation(
			internal.email.outbound.establishProviderAcceptance,
			{
				sendId: args.sendId,
				messageId: args.messageId,
				externalMessageId: result.externalMessageId,
				acceptedAt: Date.now(),
			},
		);
		if (accepted) {
			await reconcileInternetMessageId(
				ctx,
				context.message._id,
				context.integration._id,
				result.externalMessageId,
				provider,
			);
		}
		return null;
	},
});

export const reconcileProviderMetadata = internalAction({
	args: {
		messageId: v.id("emailMessages"),
		externalMessageId: v.string(),
		integrationId: v.id("emailIntegrations"),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		const integration = await ctx.runQuery(
			internal.email.integrations.getOutboundAccessContext,
			{ integrationId: args.integrationId },
		);
		if (!integration) {
			return null;
		}
		try {
			const connection = await connectOutboundEmailProvider(integration);
			if (connection.status === "ready") {
				await reconcileInternetMessageId(
					ctx,
					args.messageId,
					args.integrationId,
					args.externalMessageId,
					connection.provider,
				);
			}
		} catch {
			// The email is already accepted; a future webhook or explicit
			// reconciliation can enrich the RFC Message-ID.
		}
		return null;
	},
});
