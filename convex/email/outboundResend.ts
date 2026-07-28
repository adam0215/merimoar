"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import type { EmailSendFailure } from "./model";
import { createOutboundEmailProvider } from "./outboundProvider";
import { fetchResendAccess } from "./resendAccess";

async function recordRetryableFailure(
	ctx: ActionCtx,
	args: {
		sendId: Id<"emailSends">;
		generation: number;
		failure: EmailSendFailure;
	},
) {
	await ctx.runMutation(
		internal.email.outbound.recordKnownRetryableFailure,
		args,
	);
}

async function recordTerminalFailure(
	ctx: ActionCtx,
	args: {
		sendId: Id<"emailSends">;
		generation: number;
		failure: EmailSendFailure;
	},
) {
	await ctx.runMutation(internal.email.outbound.recordTerminalFailure, args);
}

async function reconcileInternetMessageId(
	ctx: ActionCtx,
	messageId: Id<"emailMessages">,
	integrationId: Id<"emailIntegrations">,
	externalMessageId: string,
	provider: ReturnType<typeof createOutboundEmailProvider>,
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
				const access = await fetchResendAccess(context.integration);
				if (access.active) {
					await reconcileInternetMessageId(
						ctx,
						context.message._id,
						context.integration._id,
						context.message.externalMessageId,
						createOutboundEmailProvider(context.integration, access.token),
					);
				}
			} catch {
				// Provider acceptance is already durable; metadata remains
				// eligible for later webhook reconciliation.
			}
			return null;
		}

		let access: Awaited<ReturnType<typeof fetchResendAccess>>;
		try {
			access = await fetchResendAccess(context.integration);
		} catch {
			await recordRetryableFailure(ctx, {
				sendId: args.sendId,
				generation: args.generation,
				failure: {
					kind: "before_provider",
					reason: "access_unavailable",
					message: "Could not obtain an email provider access token.",
				},
			});
			throw new Error("Email provider access is temporarily unavailable");
		}
		if (!access.active) {
			await ctx.runMutation(
				internal.email.integrations.markNeedsReauthorization,
				{
					integrationId: context.integration._id,
					expectedConnectedAccountUpdatedAt:
						context.integration.workosConnectedAccountUpdatedAt,
				},
			);
			await recordTerminalFailure(ctx, {
				sendId: args.sendId,
				generation: args.generation,
				failure: {
					kind: "before_provider",
					reason:
						access.error === "missing_required_scope"
							? "configuration"
							: "route_inactive",
					message:
						access.error === "missing_required_scope"
							? "Resend must grant the full_access scope."
							: "The Resend account must be reauthorized.",
				},
			});
			return null;
		}

		const provider = createOutboundEmailProvider(
			context.integration,
			access.token,
		);
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
			await recordTerminalFailure(ctx, {
				sendId: args.sendId,
				generation: args.generation,
				failure: {
					kind: "ambiguous",
					message:
						"The provider outcome is unknown; the email will not be sent again.",
				},
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
				await recordRetryableFailure(ctx, {
					sendId: args.sendId,
					generation: args.generation,
					failure: {
						kind: "provider_rejected",
						reason: "transient",
						message: result.message,
					},
				});
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
			await recordTerminalFailure(ctx, {
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
			internal.email.integrations.getResendAccessContext,
			{ integrationId: args.integrationId },
		);
		if (!integration) {
			return null;
		}
		try {
			const access = await fetchResendAccess(integration);
			if (access.active) {
				await reconcileInternetMessageId(
					ctx,
					args.messageId,
					args.integrationId,
					args.externalMessageId,
					createOutboundEmailProvider(integration, access.token),
				);
			}
		} catch {
			// The email is already accepted; a future webhook or explicit
			// reconciliation can enrich the RFC Message-ID.
		}
		return null;
	},
});
