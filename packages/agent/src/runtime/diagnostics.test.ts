import { describe, expect, it } from "vitest";
import { getDiagnosticErrorMessage, getErrorMessage } from "./diagnostics";

describe("agent runtime diagnostics", () => {
	it("preserves the exact error message for canonical persistence", () => {
		const message = `Authorization: Bearer model-visible-value\n${"x".repeat(25_000)}`;

		expect(getErrorMessage(new Error(message))).toBe(message);
	});

	it("redacts credentials embedded in provider errors", () => {
		expect(
			getDiagnosticErrorMessage(
				new Error(
					"Request failed: Authorization: Bearer private-token; proxy=Basic cHJveHk6cGFzcw==; api_key=private-key; runtimeSecret=runtime-secret; googleApiKey=google-key; https://user:password@provider.test/models?key=url-key&session_token=session-token",
				),
			),
		).toBe(
			"Request failed: Authorization: [REDACTED]; proxy=Basic [REDACTED]; api_key=[REDACTED]; runtimeSecret=[REDACTED]; googleApiKey=[REDACTED]; https://[REDACTED]@provider.test/models?key=[REDACTED]&session_token=[REDACTED]",
		);
	});

	it("redacts JSON and escaped JSON credentials in error messages", () => {
		const message = String.raw`provider payload={"apiKey":"GOOGLESECRET","token":"TOKENSECRET","runtimeSecret":"RUNTIMESECRET","nested":[{"Refresh_Token":"REFRESHSECRET"},{"headers":{"AUTHORIZATION":"Bearer HEADERSECRET"}}]} escaped={\"client_secret\":\"CLIENTSECRET\",\"password\":\"PASSSECRET\"}`;
		const sanitized = getDiagnosticErrorMessage(new Error(message));

		for (const secret of [
			"GOOGLESECRET",
			"TOKENSECRET",
			"RUNTIMESECRET",
			"REFRESHSECRET",
			"HEADERSECRET",
			"CLIENTSECRET",
			"PASSSECRET",
		]) {
			expect(sanitized).not.toContain(secret);
		}
		expect(sanitized).toContain('"apiKey":"[REDACTED]"');
		expect(sanitized).toContain(String.raw`\"client_secret\":\"[REDACTED]\"`);
	});

	it("does not redact non-credential JSON fields or innocent words", () => {
		const message =
			'{"tokenCount":42,"secretariat":"public","monkey":"banana","apiKeyboard":"visible"}';
		expect(getDiagnosticErrorMessage(new Error(message))).toBe(message);
	});
});
