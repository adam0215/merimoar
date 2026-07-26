/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import { createTest, syncWorkosUser } from "../test.setup";

const ORGANIZATION = {
	id: "org_merimoar",
	name: "Merimoar",
	object: "organization" as const,
	domains: [],
	externalId: null,
	metadata: {},
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

function membership(status: "active" | "inactive" | "pending" = "active") {
	return {
		id: "om_adam",
		userId: "user_adam",
		organizationId: ORGANIZATION.id,
		status,
		roles: [],
		object: "organization_membership" as const,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
}

describe("official WorkOS component projection", () => {
	it("projects organizations and memberships idempotently", async () => {
		const base = createTest();

		await base.mutation(internal.workos.authKitEvent, {
			event: "organization.created",
			data: ORGANIZATION,
		});
		await base.mutation(internal.workos.authKitEvent, {
			event: "organization_membership.created",
			data: membership(),
		});
		await base.mutation(internal.workos.authKitEvent, {
			event: "organization_membership.created",
			data: membership(),
		});

		const result = await base.run(async (ctx) => {
			const organization = await ctx.db
				.query("organizations")
				.withIndex("by_workos_organization_id", (index) =>
					index.eq("workosOrganizationId", ORGANIZATION.id),
				)
				.unique();
			const members = organization
				? await ctx.db
						.query("organizationMembers")
						.withIndex("by_organization_id_and_workos_user_id", (index) =>
							index
								.eq("organizationId", organization._id)
								.eq("workosUserId", "user_adam"),
						)
						.take(2)
				: [];
			return { organization, members };
		});

		expect(result.organization).toMatchObject({
			name: "Merimoar",
			active: true,
		});
		expect(result.members).toMatchObject([
			{ workosUserId: "user_adam", active: true },
		]);
	});

	it("converges when a membership arrives before its organization", async () => {
		const base = createTest();

		await base.mutation(internal.workos.authKitEvent, {
			event: "organization_membership.created",
			data: membership(),
		});
		await base.mutation(internal.workos.authKitEvent, {
			event: "organization.created",
			data: ORGANIZATION,
		});

		expect(
			await base.run(async (ctx) =>
				ctx.db
					.query("organizations")
					.withIndex("by_workos_organization_id", (index) =>
						index.eq("workosOrganizationId", ORGANIZATION.id),
					)
					.unique(),
			),
		).toMatchObject({ name: "Merimoar", active: true });
	});

	it("removes inactive members from access and owner options", async () => {
		const base = createTest();
		await syncWorkosUser(base, {
			id: "user_adam",
			name: "Adam Gustafsson",
			email: "adam@example.com",
		});
		await base.mutation(internal.workos.authKitEvent, {
			event: "organization.created",
			data: ORGANIZATION,
		});
		await base.mutation(internal.workos.authKitEvent, {
			event: "organization_membership.created",
			data: membership(),
		});
		const actor = base.withIdentity({
			issuer: "issuer",
			subject: "user_adam",
			org_id: ORGANIZATION.id,
		});

		const memberId = (await actor.query(api.case.reader.getCreateOptions, {}))
			.members[0]?._id;
		expect(memberId).toBeDefined();

		await base.mutation(internal.workos.authKitEvent, {
			event: "organization_membership.updated",
			data: membership("inactive"),
		});

		expect(await actor.query(api.auth.members.currentAccess, {})).toBe(
			"inactive",
		);
		await expect(
			actor.mutation(api.case.mutations.create, {
				title: "Invalid owner",
				description: "",
				ownerMemberId: memberId ?? null,
				dueAt: null,
				initialEventBody: "",
				contactIds: [],
				entityIds: [],
			}),
		).rejects.toThrow("active WorkOS");
	});

	it("deactivates deleted memberships and organizations", async () => {
		const base = createTest();
		await base.mutation(internal.workos.authKitEvent, {
			event: "organization.created",
			data: ORGANIZATION,
		});
		await base.mutation(internal.workos.authKitEvent, {
			event: "organization_membership.created",
			data: membership(),
		});
		await base.mutation(internal.workos.authKitEvent, {
			event: "organization_membership.deleted",
			data: membership(),
		});
		await base.mutation(internal.workos.authKitEvent, {
			event: "organization.deleted",
			data: ORGANIZATION,
		});

		const state = await base.run(async (ctx) => {
			const organization = await ctx.db
				.query("organizations")
				.withIndex("by_workos_organization_id", (index) =>
					index.eq("workosOrganizationId", ORGANIZATION.id),
				)
				.unique();
			const member = organization
				? await ctx.db
						.query("organizationMembers")
						.withIndex("by_organization_id_and_workos_user_id", (index) =>
							index
								.eq("organizationId", organization._id)
								.eq("workosUserId", "user_adam"),
						)
						.unique()
				: null;
			return { organization, member };
		});

		expect(state.organization?.active).toBe(false);
		expect(state.member?.active).toBe(false);
	});
});
