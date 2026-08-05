"use node";

import type { EmailSendFailure } from "#/email/model";
import { connectResendOutboundEmailProvider } from "#/email/outboundResendProvider";
import type { EmailIntegrationAccessContext } from "#/integrations/model";
import type { Doc } from "../_generated/dataModel";

export type ProviderSendResult =
	| { status: "accepted"; externalMessageId: string }
	| {
			status: "rejected";
			kind: "authorization" | "configuration" | "transient" | "permanent";
			message: string;
	  };

export interface OutboundEmailProvider {
	send(
		message: Extract<Doc<"emailMessages">, { direction: "outbound" }>,
	): Promise<ProviderSendResult>;
	retrieveInternetMessageId(externalMessageId: string): Promise<string | null>;
}

export type OutboundProviderConnection =
	| {
			status: "ready";
			provider: OutboundEmailProvider;
	  }
	| {
			status: "unavailable";
			failure: Extract<EmailSendFailure, { kind: "before_provider" }>;
			workosAccessFailure?: "needs_reauthorization" | "not_installed";
	  };

export async function connectOutboundEmailProvider(
	integration: EmailIntegrationAccessContext,
): Promise<OutboundProviderConnection> {
	switch (integration.providerSlug) {
		case "resend":
			return await connectResendOutboundEmailProvider(integration);
		default:
			return {
				status: "unavailable",
				failure: {
					kind: "before_provider",
					reason: "configuration",
					message: "This connected account has no email provider binding.",
				},
			};
	}
}
