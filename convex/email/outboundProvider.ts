"use node";

import { type ErrorResponse, Resend } from "resend";
import type { Doc } from "../_generated/dataModel";
import { createProviderIdempotencyKey } from "./outboundModel";

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

function formatMailbox({ address, name }: { address: string; name?: string }) {
	return name
		? `"${name.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}" <${address}>`
		: address;
}

export function classifyResendSendError(
	error: Pick<ErrorResponse, "name" | "statusCode">,
): Exclude<ProviderSendResult, { status: "accepted" }>["kind"] {
	if (
		error.name === "invalid_api_key" ||
		error.name === "missing_api_key" ||
		error.name === "restricted_api_key" ||
		error.name === "invalid_access"
	) {
		return "authorization";
	}
	if (
		error.name === "validation_error" ||
		error.name === "invalid_from_address" ||
		error.name === "daily_quota_exceeded" ||
		error.name === "monthly_quota_exceeded"
	) {
		return "configuration";
	}
	return error.name === "concurrent_idempotent_requests" ||
		error.statusCode === 429 ||
		(error.statusCode !== null && error.statusCode >= 500)
		? "transient"
		: "permanent";
}

class ResendOutboundEmailProvider implements OutboundEmailProvider {
	private readonly resend: Resend;

	constructor(token: string) {
		this.resend = new Resend(token);
	}

	async send(
		message: Extract<Doc<"emailMessages">, { direction: "outbound" }>,
	): Promise<ProviderSendResult> {
		const request = createResendSendRequest(message);
		const result = await this.resend.emails.send(
			request.payload,
			request.options,
		);
		if (result.error) {
			return {
				status: "rejected",
				kind: classifyResendSendError(result.error),
				message: result.error.message,
			};
		}
		if (!result.data) {
			return {
				status: "rejected",
				kind: "permanent",
				message: "Resend returned no email identifier.",
			};
		}
		return {
			status: "accepted",
			externalMessageId: result.data.id,
		};
	}

	async retrieveInternetMessageId(externalMessageId: string) {
		const result = await this.resend.emails.get(externalMessageId);
		return result.data?.message_id ?? null;
	}
}

export function createResendSendRequest(
	message: Extract<Doc<"emailMessages">, { direction: "outbound" }>,
) {
	const headers: Record<string, string> = {};
	if (message.inReplyTo) {
		headers["In-Reply-To"] = message.inReplyTo;
	}
	if (message.references.length > 0) {
		headers.References = message.references.join(" ");
	}
	return {
		payload: {
			from: formatMailbox(message.from),
			to: message.to.map(formatMailbox),
			subject: message.subject,
			text: message.textBody,
			...(Object.keys(headers).length > 0 ? { headers } : {}),
			tags: [{ name: "merimoar_message_id", value: message._id }],
		},
		options: {
			idempotencyKey: createProviderIdempotencyKey(message._id),
		},
	};
}

export function createOutboundEmailProvider(
	integration: Doc<"emailIntegrations">,
	token: string,
): OutboundEmailProvider {
	switch (integration.provider) {
		case "resend":
			return new ResendOutboundEmailProvider(token);
	}
}
