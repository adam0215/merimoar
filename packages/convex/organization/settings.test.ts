/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { createTest, syncWorkosUser } from "#/test.setup";
import { api } from "../_generated/api";

async function createFixture() {
	const base = createTest();
	await syncWorkosUser(base, {
		id: "user_organization_settings",
		name: "Settings User",
		email: "settings@example.com",
	});
	await base.run(async (ctx) => {
		const organizationId = await ctx.db.insert("organizations", {
			name: "Settings organization",
			workosOrganizationId: "org_settings",
			referenceSlug: "CASE",
			active: true,
		});
		await ctx.db.insert("organizationMembers", {
			organizationId,
			workosUserId: "user_organization_settings",
			active: true,
		});
	});
	return base.withIdentity({
		issuer: "https://api.workos.com/",
		subject: "user_organization_settings",
		org_id: "org_settings",
	});
}

describe("organization settings", () => {
	it("normalizes and updates the case reference prefix", async () => {
		const actor = await createFixture();

		expect(await actor.query(api.organization.settings.get, {})).toEqual({
			referenceSlug: "CASE",
		});
		await actor.mutation(api.organization.settings.updateReferenceSlug, {
			referenceSlug: " acm ",
		});
		expect(await actor.query(api.organization.settings.get, {})).toEqual({
			referenceSlug: "ACM",
		});
	});

	it.each([
		["A", "Use minimum 2 characters"],
		["ABCDE", "Use maximum 4 characters"],
		["A-12", "Use letters only"],
	])("rejects the invalid prefix %s", async (referenceSlug, message) => {
		const actor = await createFixture();

		await expect(
			actor.mutation(api.organization.settings.updateReferenceSlug, {
				referenceSlug,
			}),
		).rejects.toThrow(message);
	});
});
