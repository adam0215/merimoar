const REDACTED = "[REDACTED]";
const MAX_DIAGNOSTIC_DEPTH = 20;
const MAX_DIAGNOSTIC_ENTRIES = 2_000;
const MAX_ARRAY_ITEMS = 200;
const MAX_OBJECT_PROPERTIES = 200;
const MAX_STRING_LENGTH = 4_000;
const MAX_SERIALIZED_LENGTH = 32_000;
const MAX_ERROR_MESSAGE_LENGTH = 20_000;

type DiagnosticValue =
	| null
	| boolean
	| number
	| string
	| DiagnosticValue[]
	| { [key: string]: DiagnosticValue };

const bearerCredentialPattern = /\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi;
const basicCredentialPattern = /\b(Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const authorizationCredentialPattern =
	/(\bauthorization\b\s*[:=]\s*)(?:Bearer\s+)?(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}&]+)/gi;
const assignedCredentialPattern =
	/(\b[a-z0-9_-]*(?:api[_ -]?key|token|password|secret|cookie|private[_ -]?key|client[_ -]?secret)\b\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}&]+)/gi;
const urlCredentialPattern =
	/([?&](?:api[_-]?key|key|[a-z0-9_-]*token|secret)=)[^&#\s]+/gi;
const urlUserInfoPattern = /\b(https?:\/\/)[^:/@\s]+:[^/@\s]+@/gi;
const sensitiveJsonField =
	"(?:authorization|[a-z0-9_-]*(?:api[_ -]?key|token|password|secret|cookie|private[_ -]?key))";
const jsonCredentialPattern = new RegExp(
	`("(?:${sensitiveJsonField})"\\s*:\\s*)"(?:\\\\.|[^"\\\\])*"`,
	"gi",
);
const escapedJsonCredentialPattern = new RegExp(
	`(\\\\+"(?:${sensitiveJsonField})\\\\+"\\s*:\\s*)\\\\+"(?:\\\\\\\\.|[^"\\\\])*\\\\+"`,
	"gi",
);

export function serializeDiagnosticValue(value: unknown) {
	try {
		const sanitized = sanitizeValue(value, {
			entries: 0,
			seen: new WeakSet<object>(),
		});
		const serialized = JSON.stringify(sanitized);
		if (serialized.length <= MAX_SERIALIZED_LENGTH) return serialized;
		return JSON.stringify({
			summary:
				"Diagnostic value omitted because it exceeded the storage limit.",
			serializedLength: serialized.length,
		});
	} catch {
		return JSON.stringify({
			summary: "Diagnostic value could not be serialized.",
		});
	}
}

export function getDiagnosticErrorMessage(error: unknown) {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: "Unknown error";
	const sanitized = redactCredentials(message);
	return sanitized.length <= MAX_ERROR_MESSAGE_LENGTH
		? sanitized
		: `${sanitized.slice(0, MAX_ERROR_MESSAGE_LENGTH - 3)}...`;
}

function sanitizeValue(
	value: unknown,
	state: { entries: number; seen: WeakSet<object> },
	depth = 0,
): DiagnosticValue {
	if (value === null) return null;
	if (typeof value === "string") {
		return clampString(redactCredentials(value));
	}
	if (typeof value === "boolean") return value;
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : String(value);
	}
	if (typeof value === "bigint") return value.toString();
	if (typeof value === "undefined") return "[undefined]";
	if (typeof value === "symbol") return "[symbol]";
	if (typeof value === "function") return "[function]";
	if (depth >= MAX_DIAGNOSTIC_DEPTH) return "[Maximum depth reached]";
	if (state.entries >= MAX_DIAGNOSTIC_ENTRIES) {
		return "[Entry limit reached]";
	}
	state.entries += 1;
	if (state.seen.has(value)) return "[Repeated reference omitted]";
	state.seen.add(value);

	if (value instanceof Error) {
		return {
			name: clampString(value.name),
			message: clampString(redactCredentials(value.message)),
		};
	}
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
	}
	if (Array.isArray(value)) {
		const items = value
			.slice(0, MAX_ARRAY_ITEMS)
			.map((item) => sanitizeValue(item, state, depth + 1));
		if (value.length > MAX_ARRAY_ITEMS) {
			items.push(`[${value.length - MAX_ARRAY_ITEMS} more items omitted]`);
		}
		return items;
	}

	const descriptors = Object.getOwnPropertyDescriptors(value);
	const entries = Object.entries(descriptors).slice(0, MAX_OBJECT_PROPERTIES);
	const sanitized: Record<string, DiagnosticValue> = {};
	for (const [rawKey, descriptor] of entries) {
		const key = clampString(rawKey);
		if (isSensitiveFieldName(rawKey)) {
			sanitized[key] = REDACTED;
		} else if ("value" in descriptor) {
			sanitized[key] = sanitizeValue(descriptor.value, state, depth + 1);
		} else {
			sanitized[key] = "[Accessor omitted]";
		}
	}
	if (Object.keys(descriptors).length > MAX_OBJECT_PROPERTIES) {
		sanitized["[omitted properties]"] =
			Object.keys(descriptors).length - MAX_OBJECT_PROPERTIES;
	}
	return sanitized;
}

function isSensitiveFieldName(key: string) {
	const normalized = key.toLocaleLowerCase().replaceAll(/[^a-z0-9]/g, "");
	return [
		"authorization",
		"cookie",
		"password",
		"secret",
		"apikey",
		"token",
		"authtoken",
		"accesstoken",
		"refreshtoken",
		"idtoken",
		"sessiontoken",
		"claimtoken",
		"clientsecret",
		"privatekey",
	].some((sensitiveName) => normalized.endsWith(sensitiveName));
}

function redactCredentials(value: string) {
	return value
		.replace(escapedJsonCredentialPattern, '$1\\"[REDACTED]\\"')
		.replace(jsonCredentialPattern, '$1"[REDACTED]"')
		.replace(urlUserInfoPattern, "$1[REDACTED]@")
		.replace(authorizationCredentialPattern, "$1[REDACTED]")
		.replace(bearerCredentialPattern, "$1 [REDACTED]")
		.replace(basicCredentialPattern, "$1 [REDACTED]")
		.replace(assignedCredentialPattern, "$1[REDACTED]")
		.replace(urlCredentialPattern, "$1[REDACTED]");
}

function clampString(value: string) {
	return value.length <= MAX_STRING_LENGTH
		? value
		: `${value.slice(0, MAX_STRING_LENGTH - 3)}...`;
}
