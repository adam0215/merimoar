import type { EmailParticipant, NormalizedInboundEmail } from "#/email/model";

type ResendReceivedEmail = {
	id: string;
	to: string[];
	from: string;
	created_at: string;
	subject: string;
	bcc: string[] | null;
	cc: string[] | null;
	reply_to: string[] | null;
	html: string | null;
	text: string | null;
	headers: Record<string, string> | null;
	message_id: string;
};

export function normalizeEmailAddress(address: string) {
	return address.trim().toLowerCase();
}

export function parseParticipant(value: string): EmailParticipant {
	const trimmed = value.trim();
	const angleAddress = trimmed.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/);

	if (!angleAddress) {
		return { address: normalizeEmailAddress(trimmed) };
	}

	const name = angleAddress[1]?.trim();
	return {
		address: normalizeEmailAddress(angleAddress[2] ?? trimmed),
		...(name ? { name } : {}),
	};
}

export function parseMessageIds(value: string | undefined) {
	if (!value) {
		return [];
	}

	const bracketedIds = value.match(/<[^>]+>/g);
	if (bracketedIds) {
		return bracketedIds;
	}

	return value
		.split(/\s+/)
		.map((part) => part.trim())
		.filter(Boolean);
}

function getHeader(
	headers: Record<string, string> | null,
	name: string,
): string | undefined {
	if (!headers) {
		return undefined;
	}

	const entry = Object.entries(headers).find(
		([headerName]) => headerName.toLowerCase() === name.toLowerCase(),
	);
	return entry?.[1];
}

export function normalizeResendEmail(
	email: ResendReceivedEmail,
	htmlToText: (html: string) => string,
): NormalizedInboundEmail {
	const receivedAt = Date.parse(email.created_at);
	const dateHeader = getHeader(email.headers, "date");
	const parsedSentAt = dateHeader ? Date.parse(dateHeader) : Number.NaN;
	const fromHeader = getHeader(email.headers, "from");
	const references = parseMessageIds(getHeader(email.headers, "references"));
	const inReplyTo = parseMessageIds(getHeader(email.headers, "in-reply-to"))[0];
	const textBody =
		email.text?.trim() ||
		(email.html ? htmlToText(email.html).trim() : "") ||
		"No readable text content.";

	return {
		externalMessageId: email.id,
		internetMessageId: email.message_id || undefined,
		inReplyTo,
		references,
		from: parseParticipant(fromHeader ?? email.from),
		to: email.to.map(parseParticipant),
		cc: (email.cc ?? []).map(parseParticipant),
		bcc: (email.bcc ?? []).map(parseParticipant),
		replyTo: (email.reply_to ?? []).map(parseParticipant),
		subject: email.subject,
		textBody,
		sentAt: Number.isNaN(parsedSentAt) ? receivedAt : parsedSentAt,
		receivedAt,
	};
}
