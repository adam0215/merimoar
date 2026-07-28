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

function pipesData({
	scopes = [],
	updatedAt,
}: {
	scopes?: string[];
	updatedAt: string;
}) {
	return {
		id: "connected_account_resend",
		object: "connected_account",
		data_integration_id: "data_integration_resend",
		provider_slug: "resend",
		user_id: "user_adam",
		organization_id: ORGANIZATION.id,
		scopes,
		state: scopes.includes("full_access")
			? "connected"
			: "needs_reauthorization",
		created_at: "2026-01-01T00:00:00.000Z",
		updated_at: updatedAt,
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
				relatedCaseIds: [],
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

	it("persists Pipes state before the first inbox and rejects stale events", async () => {
		const base = createTest();
		await base.mutation(internal.workos.processPipesWebhookEvent, {
			eventId: "event_needs_reauthorization",
			event: "pipes.connected_account.reauthorization_needed",
			data: pipesData({ updatedAt: "2026-01-01T00:02:00.000Z" }),
		});
		await base.mutation(internal.workos.processPipesWebhookEvent, {
			eventId: "event_stale_connected",
			event: "pipes.connected_account.connected",
			data: pipesData({
				scopes: ["full_access"],
				updatedAt: "2026-01-01T00:01:00.000Z",
			}),
		});

		const state = await base.run(async (ctx) => {
			const organization = await ctx.db
				.query("organizations")
				.withIndex("by_workos_organization_id", (query) =>
					query.eq("workosOrganizationId", ORGANIZATION.id),
				)
				.unique();
			const integration = organization
				? await ctx.db
						.query("emailIntegrations")
						.withIndex("by_workos_connected_account_id", (query) =>
							query.eq("workosConnectedAccountId", "connected_account_resend"),
						)
						.unique()
				: null;
			return { integration, organization };
		});
		expect(state.organization).toMatchObject({ active: true });
		expect(state.integration).toMatchObject({
			status: "needs_reauthorization",
			workosConnectedAccountUpdatedAt: Date.parse("2026-01-01T00:02:00.000Z"),
		});
	});

	it("processes each Pipes event ID once and accepts a newer snapshot", async () => {
		const base = createTest();
		await base.mutation(internal.workos.processPipesWebhookEvent, {
			eventId: "event_connected",
			event: "pipes.connected_account.connected",
			data: pipesData({
				scopes: ["full_access"],
				updatedAt: "2026-01-01T00:03:00.000Z",
			}),
		});
		await base.mutation(internal.workos.processPipesWebhookEvent, {
			eventId: "event_connected",
			event: "pipes.connected_account.reauthorization_needed",
			data: pipesData({ updatedAt: "2026-01-01T00:04:00.000Z" }),
		});

		const state = await base.run(async (ctx) => ({
			integration: await ctx.db.query("emailIntegrations").first(),
			events: await ctx.db.query("emailIntegrationSyncEvents").collect(),
		}));
		expect(state.integration).toMatchObject({
			status: "connected",
			workosConnectedAccountUpdatedAt: Date.parse("2026-01-01T00:03:00.000Z"),
		});
		expect(state.events).toHaveLength(1);

		await base.mutation(internal.workos.processPipesWebhookEvent, {
			eventId: "event_disconnected",
			event: "pipes.connected_account.disconnected",
			data: pipesData({ updatedAt: "2026-01-01T00:05:00.000Z" }),
		});
		expect(
			await base.run(async (ctx) => ctx.db.query("emailIntegrations").first()),
		).toMatchObject({ status: "disconnected" });
	});

	it("acknowledges connected-account events for other providers", async () => {
		const base = createTest();
		await expect(
			base.mutation(internal.workos.processPipesWebhookEvent, {
				eventId: "event_github",
				event: "pipes.connected_account.connected",
				data: {
					id: "connected_account_github",
					data_integration_id: "data_integration_github",
					provider_slug: "github",
					organization_id: null,
					user_id: "user_adam",
					scopes: ["repo"],
					updated_at: "2026-01-01T00:01:00.000Z",
				},
			}),
		).resolves.toBeNull();

		const state = await base.run(async (ctx) => ({
			events: await ctx.db.query("emailIntegrationSyncEvents").collect(),
			integrations: await ctx.db.query("emailIntegrations").collect(),
		}));
		expect(state.events).toHaveLength(0);
		expect(state.integrations).toHaveLength(0);
	});
});
