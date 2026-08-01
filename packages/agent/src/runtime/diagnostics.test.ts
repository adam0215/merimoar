import { describe, expect, it } from "vitest";
import {
	getDiagnosticErrorMessage,
	serializeDiagnosticValue,
} from "./diagnostics";

describe("agent runtime diagnostics", () => {
	it("redacts credentials while retaining useful tool context", () => {
		const input = {
			caseId: "case-1",
			authorization: "Bearer top-secret-token",
			configuration: {
				googleApiKey: "private-api-key",
				claimToken: "private-claim-token",
				note: "Call failed with access_token=private-access-token",
			},
		};

		expect(JSON.parse(serializeDiagnosticValue(input))).toEqual({
			caseId: "case-1",
			authorization: "[REDACTED]",
			configuration: {
				googleApiKey: "[REDACTED]",
				claimToken: "[REDACTED]",
				note: "Call failed with access_token=[REDACTED]",
			},
		});
	});

	it("serializes circular and oversized values as bounded valid JSON", () => {
		const circular: Record<string, unknown> = { id: 1n };
		circular.self = circular;

		expect(JSON.parse(serializeDiagnosticValue(circular))).toEqual({
			id: "1",
			self: "[Repeated reference omitted]",
		});

		const serialized = serializeDiagnosticValue({
			values: Array.from({ length: 200 }, (_, index) => ({
				index,
				text: "x".repeat(4_000),
			})),
		});
		expect(serialized.length).toBeLessThan(1_000);
		expect(JSON.parse(serialized)).toMatchObject({
			summary: expect.stringContaining("storage limit"),
		});
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

	it("redacts nested provider payload credentials", () => {
		const serialized = serializeDiagnosticValue({
			provider: "google",
			request: {
				headers: {
					Authorization: "Basic c2VydmljZTpwYXNzd29yZA==",
					xApiKey: "provider-key",
				},
				url: "https://service:password@provider.test/run?api_key=url-key",
				payload: {
					clientSecret: "client-secret",
					refresh_token: "refresh-token",
				},
			},
		});

		expect(serialized).not.toContain("provider-key");
		expect(serialized).not.toContain("password");
		expect(serialized).not.toContain("client-secret");
		expect(serialized).not.toContain("refresh-token");
		expect(JSON.parse(serialized)).toMatchObject({
			provider: "google",
			request: {
				headers: {
					Authorization: "[REDACTED]",
					xApiKey: "[REDACTED]",
				},
				url: "https://[REDACTED]@provider.test/run?api_key=[REDACTED]",
			},
		});
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
