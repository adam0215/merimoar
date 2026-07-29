import type { Doc } from "../_generated/dataModel";
import type { EmailParticipant } from "./model";
import { normalizeEmailAddress } from "./normalize";

export function createReplySubject(subject: string) {
	const replySubject = subject.replace(/^(?:\s*re\s*:\s*)+/iu, "").trim();
	return `Re: ${replySubject || "(No subject)"}`;
}

export function createReplyThreading(
	message: Extract<Doc<"emailMessages">, { direction: "inbound" }>,
) {
	const references = [...message.references];
	if (
		message.internetMessageId &&
		!references.includes(message.internetMessageId)
	) {
		references.push(message.internetMessageId);
	}
	return {
		inReplyTo: message.internetMessageId,
		references,
	};
}

export function selectReplyRecipient(
	message: Extract<Doc<"emailMessages">, { direction: "inbound" }>,
	inboxAddress: string,
): EmailParticipant | null {
	const normalizedInboxAddress = normalizeEmailAddress(inboxAddress);
	const recipient = message.replyTo[0] ?? message.from;
	return normalizeEmailAddress(recipient.address) !== normalizedInboxAddress
		? recipient
		: null;
}

export function isReservedNonDeliverableAddress(address: string) {
	const domain = normalizeEmailAddress(address).split("@").at(-1);
	return domain === "invalid" || domain?.endsWith(".invalid") === true;
}

export function createProviderIdempotencyKey(messageId: string) {
	return `merimoar-email-${messageId}`;
}

export function readResendInternetMessageId(data: unknown) {
	if (
		typeof data !== "object" ||
		data === null ||
		!("message_id" in data) ||
		typeof data.message_id !== "string"
	) {
		return undefined;
	}
	const internetMessageId = data.message_id.trim();
	return internetMessageId || undefined;
}
