/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { createTest, syncWorkosUser } from "#/test.setup";
import { api, internal } from "../_generated/api";

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

async function processConnectedAccount(
	test: ReturnType<typeof createTest>,
	{
		dataIntegrationId = "data_integration_resend",
		event = "pipes.connected_account.connected",
		eventId,
		organizationId = ORGANIZATION.id,
		providerSlug = "resend",
		scopes = [],
		updatedAt = "2026-01-01T00:01:00.000Z",
	}: {
		dataIntegrationId?: string;
		event?:
			| "pipes.connected_account.connected"
			| "pipes.connected_account.disconnected"
			| "pipes.connected_account.reauthorization_needed";
		eventId: string;
		organizationId?: string | null;
		providerSlug?: string;
		scopes?: string[];
		updatedAt?: string;
	},
) {
	return await test.mutation(
		internal.workos.processConnectedAccountWebhookEvent,
		{
			eventId,
			event,
			data: {
				id: "connected_account_resend",
				data_integration_id: dataIntegrationId,
				provider_slug: providerSlug,
				user_id: "user_adam",
				organization_id: organizationId,
				scopes,
				updated_at: updatedAt,
			},
		},
	);
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

	it("persists generic Pipes state and rejects stale events", async () => {
		const base = createTest();
		await processConnectedAccount(base, {
			eventId: "event_needs_reauthorization",
			event: "pipes.connected_account.reauthorization_needed",
			updatedAt: "2026-01-01T00:02:00.000Z",
		});
		await processConnectedAccount(base, {
			eventId: "event_stale_connected",
			scopes: ["full_access"],
			updatedAt: "2026-01-01T00:01:00.000Z",
		});

		const state = await base.run(async (ctx) => {
			const organization = await ctx.db
				.query("organizations")
				.withIndex("by_workos_organization_id", (query) =>
					query.eq("workosOrganizationId", ORGANIZATION.id),
				)
				.unique();
			const connectedAccount = organization
				? await ctx.db
						.query("connectedAccounts")
						.withIndex("by_workos_connected_account_id", (query) =>
							query.eq("workosConnectedAccountId", "connected_account_resend"),
						)
						.unique()
				: null;
			return { connectedAccount, organization };
		});
		expect(state.organization).toMatchObject({ active: true });
		expect(state.connectedAccount).toMatchObject({
			connectionStatus: "needs_reauthorization",
			workosUpdatedAt: Date.parse("2026-01-01T00:02:00.000Z"),
		});
	});

	it("processes each Pipes event ID once and accepts a newer snapshot", async () => {
		const base = createTest();
		await processConnectedAccount(base, {
			eventId: "event_connected",
			scopes: ["full_access"],
			updatedAt: "2026-01-01T00:03:00.000Z",
		});
		await processConnectedAccount(base, {
			eventId: "event_connected",
			event: "pipes.connected_account.reauthorization_needed",
			updatedAt: "2026-01-01T00:04:00.000Z",
		});

		const state = await base.run(async (ctx) => ({
			connectedAccount: await ctx.db.query("connectedAccounts").first(),
			events: await ctx.db.query("connectedAccountSyncEvents").collect(),
		}));
		expect(state.connectedAccount).toMatchObject({
			connectionStatus: "connected",
			workosUpdatedAt: Date.parse("2026-01-01T00:03:00.000Z"),
		});
		expect(state.events).toHaveLength(1);

		await processConnectedAccount(base, {
			eventId: "event_disconnected",
			event: "pipes.connected_account.disconnected",
			updatedAt: "2026-01-01T00:05:00.000Z",
		});
		expect(
			await base.run(async (ctx) => ctx.db.query("connectedAccounts").first()),
		).toMatchObject({ connectionStatus: "disconnected" });
	});

	it("keeps the provider alias when WorkOS reports a custom provider type", async () => {
		const base = createTest();
		await processConnectedAccount(base, {
			eventId: "event_connected",
			scopes: ["full_access"],
		});
		await processConnectedAccount(base, {
			eventId: "event_reauthorization",
			event: "pipes.connected_account.reauthorization_needed",
			providerSlug: "custom",
			updatedAt: "2026-01-01T00:02:00.000Z",
		});

		expect(
			await base.run(async (ctx) => ctx.db.query("connectedAccounts").first()),
		).toMatchObject({
			providerSlug: "resend",
			connectionStatus: "needs_reauthorization",
			workosUpdatedAt: Date.parse("2026-01-01T00:02:00.000Z"),
		});
	});

	it.each([
		"google",
		"github",
		"custom-provider",
	])("upserts %s without creating an email integration", async (providerSlug) => {
		const base = createTest();
		await expect(
			processConnectedAccount(base, {
				eventId: `event_${providerSlug}`,
				providerSlug,
				scopes: ["read"],
			}),
		).resolves.toBeNull();

		const state = await base.run(async (ctx) => ({
			accounts: await ctx.db.query("connectedAccounts").collect(),
			integrations: await ctx.db.query("emailIntegrations").collect(),
		}));
		expect(state.accounts).toMatchObject([{ providerSlug }]);
		expect(state.integrations).toHaveLength(0);
	});

	it("records but does not attach organization-unscoped accounts", async () => {
		const base = createTest();
		await processConnectedAccount(base, {
			eventId: "event_unscoped",
			organizationId: null,
		});
		const state = await base.run(async (ctx) => ({
			accounts: await ctx.db.query("connectedAccounts").collect(),
			event: await ctx.db.query("connectedAccountSyncEvents").first(),
		}));
		expect(state.accounts).toHaveLength(0);
		expect(state.event).toMatchObject({ outcome: "ignored_unscoped" });
	});

	it("uses a safe deterministic status tie-break and rejects identity moves", async () => {
		const base = createTest();
		const updatedAt = "2026-01-01T00:01:00.000Z";
		await processConnectedAccount(base, {
			eventId: "event_degraded",
			event: "pipes.connected_account.reauthorization_needed",
			scopes: ["full_access"],
			updatedAt,
		});
		await processConnectedAccount(base, {
			eventId: "event_late_connected",
			scopes: ["full_access", "extra"],
			updatedAt,
		});
		expect(
			await base.run(async (ctx) => ctx.db.query("connectedAccounts").first()),
		).toMatchObject({
			connectionStatus: "needs_reauthorization",
			grantedScopes: ["full_access"],
		});

		await expect(
			processConnectedAccount(base, {
				eventId: "event_identity_move",
				dataIntegrationId: "data_integration_other",
				updatedAt: "2026-01-01T00:02:00.000Z",
			}),
		).rejects.toThrow("cannot change external identity");

		await expect(
			processConnectedAccount(base, {
				eventId: "event_organization_move",
				organizationId: "org_other",
				updatedAt: "2026-01-01T00:02:00.000Z",
			}),
		).rejects.toThrow("cannot change organization");
	});
});
