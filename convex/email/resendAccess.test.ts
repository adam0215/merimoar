import { describe, expect, it } from "vitest";
import { resolveResendAccess } from "./resendAccess";

describe("Resend Pipes access", () => {
	it("returns an active OAuth token with the required scope", () => {
		expect(
			resolveResendAccess({
				active: true,
				accessToken: {
					object: "access_token",
					accessToken: "oauth-token",
					expiresAt: new Date("2026-07-27T12:00:00.000Z"),
					scopes: ["full_access"],
					missingScopes: [],
				},
			}),
		).toEqual({ active: true, token: "oauth-token" });
	});

	it("preserves WorkOS reauthorization failures", () => {
		expect(
			resolveResendAccess({
				active: false,
				error: "needs_reauthorization",
			}),
		).toEqual({
			active: false,
			error: "needs_reauthorization",
		});
	});

	it("rejects tokens that do not grant full access", () => {
		expect(
			resolveResendAccess({
				active: true,
				accessToken: {
					object: "access_token",
					accessToken: "send-only-token",
					expiresAt: null,
					scopes: ["emails:send"],
					missingScopes: ["full_access"],
				},
			}),
		).toEqual({
			active: false,
			error: "missing_required_scope",
		});
	});
});
