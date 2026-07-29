import { normalizeEmailAddress } from "#/email/normalize";

const MAX_RECIPIENTS_PER_EVENT = 100;

function normalizeUniqueAddresses(addresses: string[]) {
	return [
		...new Set(
			addresses
				.map(normalizeEmailAddress)
				.filter((address) => address.length > 0),
		),
	];
}

export function selectIngestRecipientAddresses({
	receivedForAddresses,
	toAddresses,
}: {
	receivedForAddresses: string[];
	toAddresses: string[];
}) {
	const authoritativeRecipients =
		normalizeUniqueAddresses(receivedForAddresses);
	const otherRecipients = normalizeUniqueAddresses(toAddresses).filter(
		(address) => !authoritativeRecipients.includes(address),
	);

	return [...authoritativeRecipients, ...otherRecipients].slice(
		0,
		MAX_RECIPIENTS_PER_EVENT,
	);
}

export function extractIngestRecipientsFromRawPayload(rawPayload: string) {
	let payload: unknown;
	try {
		payload = JSON.parse(rawPayload);
	} catch {
		return [];
	}
	if (!isRecord(payload) || !isRecord(payload.data)) {
		return [];
	}

	return selectIngestRecipientAddresses({
		receivedForAddresses: stringArray(payload.data.received_for),
		toAddresses: stringArray(payload.data.to),
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function stringArray(value: unknown) {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}
