"use node";

import { ConvexError, v } from "convex/values";
import { Resend } from "resend";
import { listVerifiedResendDomainNames } from "#/email/outboundDomainModel";
import { fetchResendAccess } from "#/email/resendAccess";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";

export const listVerified = action({
	args: {
		integrationId: v.id("emailIntegrations"),
	},
	returns: v.array(v.string()),
	handler: async (ctx, args) => {
		const integration = await ctx.runQuery(
			internal.email.integrations.getSelectableResendAccessContext,
			args,
		);
		if (!integration) {
			throw new ConvexError({
				code: "EMAIL_INTEGRATION_NOT_CONNECTED",
				message: "Connect the email integration before loading domains.",
			});
		}

		const access = await fetchResendAccess(integration);
		if (!access.active) {
			if (access.error !== "missing_required_scope") {
				await ctx.runMutation(
					internal.email.integrations.recordWorkosAccessFailure,
					{
						integrationId: integration.integrationId,
						expectedConnectedAccountId: integration.connectedAccountId,
						expectedWorkosUpdatedAt: integration.workosUpdatedAt,
						error: access.error,
					},
				);
			}
			throw new ConvexError({
				code: "EMAIL_INTEGRATION_NOT_CONNECTED",
				message:
					access.error === "missing_required_scope"
						? "Resend must grant the full_access scope before loading domains."
						: "Reconnect the email integration before loading domains.",
			});
		}

		let response: Awaited<ReturnType<Resend["domains"]["list"]>>;
		try {
			response = await new Resend(access.token).domains.list();
		} catch (error) {
			console.error("Could not load Resend domains.", error);
			throw new ConvexError({
				code: "EMAIL_DOMAINS_UNAVAILABLE",
				message: "The outbound domains could not be loaded.",
			});
		}
		if (response.error || !response.data) {
			throw new ConvexError({
				code: "EMAIL_DOMAINS_UNAVAILABLE",
				message:
					response.error?.message ??
					"The outbound domains could not be loaded.",
			});
		}

		return listVerifiedResendDomainNames(response.data.data);
	},
});
