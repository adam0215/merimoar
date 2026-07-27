const REPLY_INTRO_PATTERN =
	/^[ \t]*(?:on\b.+\bwrote|den\b.+\bskrev\b.+|på\b.+\bskrev\b.+|am\b.+\bschrieb\b.+|le\b.+\ba écrit\b.+|op\b.+\bschreef\b.+|el\b.+\bescribió\b.+)[ \t]*:?[ \t]*$/imu;
const ORIGINAL_MESSAGE_SEPARATOR_PATTERN =
	/^[ \t]*-{2,}[ \t]*(?:original message|ursprungligt meddelande)[ \t]*-{2,}[ \t]*$/imu;
const QUOTED_LINE_PATTERN = /^[ \t]*>/mu;
const ORIGINAL_MESSAGE_HEADERS_PATTERN =
	/^[ \t]*(?:from|från):[^\r\n]+\r?\n(?:[^\r\n]*\r?\n){0,4}[ \t]*(?:sent|skickat|date|datum|to|till|subject|ämne):[ \t]*\S+/imu;

function findQuotedContentStart(text: string) {
	const patterns = [
		REPLY_INTRO_PATTERN,
		ORIGINAL_MESSAGE_SEPARATOR_PATTERN,
		QUOTED_LINE_PATTERN,
		ORIGINAL_MESSAGE_HEADERS_PATTERN,
	];
	let firstMatch = -1;

	for (const pattern of patterns) {
		const match = text.search(pattern);
		if (match >= 0 && (firstMatch < 0 || match < firstMatch)) {
			firstMatch = match;
		}
	}

	return firstMatch;
}

export function parseEmailReply(textBody: string) {
	const quotedContentStart = findQuotedContentStart(textBody);
	if (quotedContentStart < 0) {
		return { authoredText: textBody.trim() };
	}

	const authoredText = textBody.slice(0, quotedContentStart).trim();
	const quotedText = textBody.slice(quotedContentStart).trim();

	return {
		authoredText,
		...(quotedText ? { quotedText } : {}),
	};
}
