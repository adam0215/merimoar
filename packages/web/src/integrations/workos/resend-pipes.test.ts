import { describe, expect, test } from "vitest";
import {
	createEmailSettingsReturnTo,
	isResendAuthorizationRejected,
	resolveResendPipesConnectionState,
} from "#/integrations/workos/resend-pipes";

describe("Resend Pipes connection state", () => {
	test("reports an unavailable provider when Resend is not configured", () => {
		expect(resolveResendPipesConnectionState([])).toBe("unavailable");
	});

	test("reports an available provider without a connected account", () => {
		expect(
			resolveResendPipesConnectionState([
				{ slug: "resend", connectedAccount: null },
			]),
		).toBe("not_connected");
	});

	test.each([
		"connected",
		"needs_reauthorization",
	] as const)("preserves the connected account state %s", (state) => {
		expect(
			resolveResendPipesConnectionState([
				{ slug: "resend", connectedAccount: { state } },
			]),
		).toBe(state);
	});

	test("treats a disconnected account as not connected", () => {
		expect(
			resolveResendPipesConnectionState([
				{
					slug: "resend",
					connectedAccount: { state: "disconnected" },
				},
			]),
		).toBe("not_connected");
	});
});

describe("Resend Pipes authorization health", () => {
	test.each([
		401, 403,
	])("treats provider authorization rejection %s as requiring reconnection", (statusCode) => {
		expect(isResendAuthorizationRejected(statusCode)).toBe(true);
	});

	test.each([
		400, 404, 429, 500,
	])("does not turn provider response %s into an authorization failure", (statusCode) => {
		expect(isResendAuthorizationRejected(statusCode)).toBe(false);
	});
});

describe("Resend Pipes return URL", () => {
	test("uses the current request origin and the fixed email settings path", () => {
		expect(
			createEmailSettingsReturnTo(
				new URL("https://app.example.com/api/server-fn?payload=secret"),
			),
		).toBe("https://app.example.com/settings/organization/email");
	});
});
