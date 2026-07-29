/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { createTest, syncWorkosUser } from "#/test.setup";
import { api } from "../_generated/api";

const ISSUER = "https://api.workos.com/user_management/client_test";
const ALTERNATE_ISSUER = "https://auth.example.com/";
const WORKOS_USER_ID = "user_adam";

async function createFixture(active?: boolean) {
	const base = createTest();
	await syncWorkosUser(base, {
		id: WORKOS_USER_ID,
		name: "Adam Gustafsson",
		email: "adam@example.com",
	});
	const organizationId = await base.run(async (ctx) => {
		const id = await ctx.db.insert("organizations", {
			name: "Merimoar",
			workosOrganizationId: "org_merimoar",
			active: true,
		});
		if (active !== undefined) {
			await ctx.db.insert("organizationMembers", {
				organizationId: id,
				workosUserId: WORKOS_USER_ID,
				active,
			});
		}
		return id;
	});
	const actor = base.withIdentity({
		issuer: ISSUER,
		subject: WORKOS_USER_ID,
		org_id: "org_merimoar",
	});
	return { actor, base, organizationId };
}

describe("WorkOS member access", () => {
	it("does not create a membership from client data", async () => {
		const { actor } = await createFixture();

		expect(await actor.query(api.auth.members.currentAccess, {})).toBe(
			"not_synced",
		);
		await expect(
			actor.query(api.case.reader.getCreateOptions, {}),
		).rejects.toThrow("active WorkOS");
	});

	it("authorizes an active membership without a second identity link", async () => {
		const { actor } = await createFixture(true);

		expect(await actor.query(api.auth.members.currentAccess, {})).toBe(
			"active",
		);
		expect(
			(await actor.query(api.case.reader.getCreateOptions, {})).members,
		).toMatchObject([
			{
				workosUserId: WORKOS_USER_ID,
				name: "Adam Gustafsson",
				email: "adam@example.com",
				active: true,
			},
		]);
	});

	it("uses the WorkOS subject across configured issuers", async () => {
		const { base } = await createFixture(true);
		const actorWithAlternateIssuer = base.withIdentity({
			issuer: ALTERNATE_ISSUER,
			subject: WORKOS_USER_ID,
			org_id: "org_merimoar",
		});

		expect(
			await actorWithAlternateIssuer.query(api.auth.members.currentAccess, {}),
		).toBe("active");
	});

	it("rejects inactive WorkOS memberships", async () => {
		const { actor } = await createFixture(false);

		expect(await actor.query(api.auth.members.currentAccess, {})).toBe(
			"inactive",
		);
		await expect(
			actor.query(api.case.reader.getCreateOptions, {}),
		).rejects.toThrow("active WorkOS");
	});

	it("does not special-case a revoked session claim", async () => {
		const { base } = await createFixture(true);
		const actor = base.withIdentity({
			issuer: ISSUER,
			subject: WORKOS_USER_ID,
			org_id: "org_merimoar",
			sid: "session_revoked_in_workos",
		});

		expect(await actor.query(api.auth.members.currentAccess, {})).toBe(
			"active",
		);
	});

	it("requires a signed organization claim and an active workspace", async () => {
		const { base, organizationId } = await createFixture(true);
		const actorWithoutOrganization = base.withIdentity({
			issuer: ISSUER,
			subject: WORKOS_USER_ID,
		});
		const actorFromUnknownOrganization = base.withIdentity({
			issuer: ISSUER,
			subject: WORKOS_USER_ID,
			org_id: "org_unknown",
		});
		await base.run(async (ctx) => {
			await ctx.db.patch(organizationId, { active: false });
		});

		expect(
			await actorWithoutOrganization.query(api.auth.members.currentAccess, {}),
		).toBe("not_provisioned");
		expect(
			await actorFromUnknownOrganization.query(
				api.auth.members.currentAccess,
				{},
			),
		).toBe("not_provisioned");
	});
});
