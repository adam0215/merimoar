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

export function getErrorMessage(error: unknown) {
	return error instanceof Error
		? error.message
		: typeof error === "string"
			? error
			: "Unknown error";
}

export function getDiagnosticErrorMessage(error: unknown) {
	return redactCredentials(getErrorMessage(error));
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
