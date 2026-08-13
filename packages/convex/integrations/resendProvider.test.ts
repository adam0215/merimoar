import { describe, expect, test } from "vitest";
import {
	DEFAULT_RESEND_PIPES_PROVIDER,
	resolveResendPipesProviderSlug,
} from "#/integrations/resendProvider";

describe("Resend Pipes provider slug", () => {
	test("defaults Development to the existing provider", () => {
		expect(resolveResendPipesProviderSlug(undefined)).toBe(
			DEFAULT_RESEND_PIPES_PROVIDER,
		);
	});

	test("uses the configured Production provider", () => {
		expect(resolveResendPipesProviderSlug("resend-prod")).toBe("resend-prod");
	});
});
