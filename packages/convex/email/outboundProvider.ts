"use node";

import type { EmailSendFailure } from "#/email/model";
import { connectResendOutboundEmailProvider } from "#/email/outboundResendProvider";
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
			reauthorizationRequired: boolean;
	  };

export async function connectOutboundEmailProvider(
	integration: Doc<"emailIntegrations">,
): Promise<OutboundProviderConnection> {
	switch (integration.provider) {
		case "resend":
			return await connectResendOutboundEmailProvider(integration);
	}
}
