import { describe, expect, it } from "vitest";
import { parseWorkOSOrganizationId } from "#/integrations/workos/organizations.ts";

describe("parseWorkOSOrganizationId", () => {
	it("accepts a WorkOS organization ID", () => {
		expect(parseWorkOSOrganizationId("org_01KYNRWVMDEPP8JRTNV5PAJNES")).toBe(
			"org_01KYNRWVMDEPP8JRTNV5PAJNES",
		);
	});

	it.each([
		undefined,
		null,
		"",
		"org_",
		"organization_123",
		"org_123\n",
	])("rejects an invalid organization ID: %s", (value) => {
		expect(() => parseWorkOSOrganizationId(value)).toThrow(
			"A valid WorkOS organization ID is required.",
		);
	});
});
