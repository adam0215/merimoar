import { NonRetryableError } from "@convex-dev/workpool";
import type { Doc } from "../_generated/dataModel";

const TERMINAL_ERROR_PREFIX = "email-ingest-terminal:";

type FailureKind = NonNullable<Doc<"emailIngestEvents">["failureKind"]>;

export function isResendAuthorizationError(error: {
	statusCode: number | null;
}) {
	return error.statusCode === 401 || error.statusCode === 403;
}

export function classifyResendRetrievalError(error: {
	statusCode: number | null;
}) {
	if (
		error.statusCode === null ||
		error.statusCode === 429 ||
		error.statusCode >= 500
	) {
		return { retryable: true as const, failureKind: "provider" as const };
	}
	if (isResendAuthorizationError(error)) {
		return {
			retryable: false as const,
			failureKind: "configuration" as const,
		};
	}
	return { retryable: false as const, failureKind: "unknown" as const };
}

export function createNonRetryableIngestError(
	failureKind: FailureKind,
	message: string,
	cause?: unknown,
) {
	return new NonRetryableError(
		`${TERMINAL_ERROR_PREFIX}${failureKind}:${message}`,
		{ cause },
	);
}

export function parseNonRetryableIngestError(message: string) {
	if (!message.startsWith(TERMINAL_ERROR_PREFIX)) {
		return null;
	}
	const encoded = message.slice(TERMINAL_ERROR_PREFIX.length);
	const separatorIndex = encoded.indexOf(":");
	if (separatorIndex === -1) {
		return null;
	}
	const failureKind = encoded.slice(0, separatorIndex);
	if (!isFailureKind(failureKind)) {
		return null;
	}
	return {
		failureKind,
		message: encoded.slice(separatorIndex + 1),
	};
}

function isFailureKind(value: string): value is FailureKind {
	return [
		"unroutable",
		"provider",
		"configuration",
		"route_inactive",
		"unknown",
	].includes(value);
}
