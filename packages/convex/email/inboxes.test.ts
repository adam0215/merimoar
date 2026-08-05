import { describe, expect, it } from "vitest";
import {
	createConnectedResendIntegration,
	createTest,
	setEmailIntegrationConnectionStatus,
	syncWorkosUser,
} from "#/test.setup";
import { api } from "../_generated/api";

const ISSUER = "https://api.workos.com/";

async function createFixture() {
	const base = createTest();
	await Promise.all([
		syncWorkosUser(base, {
			id: "user_adam",
			name: "Adam",
			email: "adam@merimoar.com",
		}),
		syncWorkosUser(base, {
			id: "user_other",
			name: "Other",
			email: "other@example.com",
		}),
	]);
	const organizationId = await base.run(async (ctx) => {
		const organizationId = await ctx.db.insert("organizations", {
			name: "Merimoar",
			workosOrganizationId: "org_merimoar",
			referenceSlug: "MER",
			active: true,
		});
		const otherOrganizationId = await ctx.db.insert("organizations", {
			name: "Other",
			workosOrganizationId: "org_other",
			referenceSlug: "OTHR",
			active: true,
		});
		await ctx.db.insert("organizationMembers", {
			organizationId,
			workosUserId: "user_adam",
			active: true,
		});
		await ctx.db.insert("organizationMembers", {
			organizationId: otherOrganizationId,
			workosUserId: "user_other",
			active: true,
		});
		return organizationId;
	});

	return {
		base,
		actor: base.withIdentity({
			issuer: ISSUER,
			subject: "user_adam",
			org_id: "org_merimoar",
		}),
		otherActor: base.withIdentity({
			issuer: ISSUER,
			subject: "user_other",
			org_id: "org_other",
		}),
		organizationId,
	};
}

describe("email inboxes", () => {
	it("creates a normalized inbox without any provider dependency", async () => {
		const { actor, base, organizationId } = await createFixture();
		const inboxId = await actor.mutation(api.email.inboxes.create, {
			displayName: " Support inbox ",
			address: " Support@Example.COM ",
			outbound: null,
		});

		const inbox = await base.run(async (ctx) => ctx.db.get(inboxId));
		expect(inbox).toMatchObject({
			organizationId,
			displayName: "Support inbox",
			address: "support@example.com",
			status: "active",
			unreadThreadCount: 0,
		});
		expect(inbox).not.toHaveProperty("provider");
		expect(inbox).not.toHaveProperty("webhookId");
	});

	it("allows an organization to create multiple inboxes without an integration", async () => {
		const { actor } = await createFixture();
		const inboxIds = await Promise.all([
			actor.mutation(api.email.inboxes.create, {
				displayName: "Support",
				address: "support@example.com",
				outbound: null,
			}),
			actor.mutation(api.email.inboxes.create, {
				displayName: "Operations",
				address: "operations@example.com",
				outbound: null,
			}),
		]);

		expect(new Set(inboxIds).size).toBe(2);
		expect(await actor.query(api.email.reader.listInboxes, {})).toHaveLength(2);
	});

	it("selects a connected outbound integration while creating an inbox", async () => {
		const { actor, base, organizationId } = await createFixture();
		const integrationId = await createConnectedResendIntegration(
			base,
			organizationId,
		);

		const inboxId = await actor.mutation(api.email.inboxes.create, {
			displayName: "Support",
			address: "support@example.com",
			outbound: {
				integrationId,
				address: " Team@Verified.Example ",
			},
		});

		expect(await base.run(async (ctx) => ctx.db.get(inboxId))).toMatchObject({
			outbound: {
				integrationId,
				address: "team@verified.example",
			},
		});
	});

	it("scopes address uniqueness to the organization router", async () => {
		const { actor, otherActor } = await createFixture();
		await actor.mutation(api.email.inboxes.create, {
			displayName: "Primary support",
			address: "support@example.com",
			outbound: null,
		});
		await expect(
			actor.mutation(api.email.inboxes.create, {
				displayName: "Duplicate support",
				address: "SUPPORT@EXAMPLE.COM",
				outbound: null,
			}),
		).rejects.toThrow("already has an inbox");
		await expect(
			otherActor.mutation(api.email.inboxes.create, {
				displayName: "Other support",
				address: "support@example.com",
				outbound: null,
			}),
		).resolves.toBeDefined();
	});

	it("serializes concurrent attempts to create the same inbox", async () => {
		const { actor } = await createFixture();
		const results = await Promise.allSettled([
			actor.mutation(api.email.inboxes.create, {
				displayName: "First",
				address: "shared@example.com",
				outbound: null,
			}),
			actor.mutation(api.email.inboxes.create, {
				displayName: "Second",
				address: "SHARED@example.com",
				outbound: null,
			}),
		]);

		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		expect(await actor.query(api.email.reader.listInboxes, {})).toHaveLength(1);
	});

	it("validates input and authorization", async () => {
		const { actor, base } = await createFixture();
		await expect(
			actor.mutation(api.email.inboxes.create, {
				displayName: "S",
				address: "not-an-email",
				outbound: null,
			}),
		).rejects.toThrow("Use at least 2 characters.");
		await expect(
			base.mutation(api.email.inboxes.create, {
				displayName: "Support",
				address: "support@example.com",
				outbound: null,
			}),
		).rejects.toThrow("Sign in");
	});

	it("removes only inboxes owned by the active organization", async () => {
		const { actor, base, otherActor } = await createFixture();
		const inboxId = await actor.mutation(api.email.inboxes.create, {
			displayName: "Support",
			address: "support@example.com",
			outbound: null,
		});

		await expect(
			otherActor.mutation(api.email.inboxes.remove, { inboxId }),
		).rejects.toThrow("could not be found");
		await actor.mutation(api.email.inboxes.remove, { inboxId });
		expect(await base.run(async (ctx) => ctx.db.get(inboxId))).toMatchObject({
			status: "disabled",
		});
	});

	it("updates inbox details and outbound routing within the active organization", async () => {
		const { actor, base, otherActor, organizationId } = await createFixture();
		const integrationId = await createConnectedResendIntegration(
			base,
			organizationId,
		);
		const inboxId = await actor.mutation(api.email.inboxes.create, {
			displayName: "Support",
			address: "support@example.com",
			outbound: null,
		});
		const otherInboxId = await actor.mutation(api.email.inboxes.create, {
			displayName: "Operations",
			address: "operations@example.com",
			outbound: null,
		});

		await actor.mutation(api.email.inboxes.update, {
			inboxId,
			displayName: "Customer support",
			address: " Help@Example.COM ",
			outbound: {
				integrationId,
				address: "support@verified.example",
			},
		});
		expect(await base.run(async (ctx) => ctx.db.get(inboxId))).toMatchObject({
			displayName: "Customer support",
			address: "help@example.com",
			outbound: {
				integrationId,
				address: "support@verified.example",
			},
		});

		await setEmailIntegrationConnectionStatus(
			base,
			integrationId,
			"disconnected",
		);
		await expect(
			actor.mutation(api.email.inboxes.update, {
				inboxId,
				displayName: "Customer care",
				address: "help@example.com",
				outbound: {
					integrationId,
					address: "support@verified.example",
				},
			}),
		).resolves.toBeNull();

		await expect(
			actor.mutation(api.email.inboxes.update, {
				inboxId,
				displayName: "Customer care",
				address: "operations@example.com",
				outbound: {
					integrationId,
					address: "support@verified.example",
				},
			}),
		).rejects.toThrow("already has an inbox");
		await expect(
			otherActor.mutation(api.email.inboxes.update, {
				inboxId: otherInboxId,
				displayName: "Other",
				address: "other@example.com",
				outbound: null,
			}),
		).rejects.toThrow("could not be found");
	});

	it("selects or clears only a connected integration from the same organization", async () => {
		const { actor, base, organizationId } = await createFixture();
		const inboxId = await actor.mutation(api.email.inboxes.create, {
			displayName: "Support",
			address: "support@example.com",
			outbound: null,
		});
		const integrationId = await createConnectedResendIntegration(
			base,
			organizationId,
		);
		await actor.mutation(api.email.inboxes.update, {
			inboxId,
			displayName: "Support",
			address: "support@example.com",
			outbound: {
				integrationId,
				address: "team@verified.example",
			},
		});
		expect(await base.run(async (ctx) => ctx.db.get(inboxId))).toMatchObject({
			outbound: {
				integrationId,
				address: "team@verified.example",
			},
		});

		const otherOrganizationId = await base.run(async (ctx) => {
			const organization = await ctx.db
				.query("organizations")
				.withIndex("by_workos_organization_id", (index) =>
					index.eq("workosOrganizationId", "org_other"),
				)
				.unique();
			if (!organization) {
				throw new Error("Expected the other organization");
			}
			return organization._id;
		});
		const otherIntegrationId = await createConnectedResendIntegration(
			base,
			otherOrganizationId,
			"other-organization",
		);
		await expect(
			actor.mutation(api.email.inboxes.update, {
				inboxId,
				displayName: "Support",
				address: "support@example.com",
				outbound: {
					integrationId: otherIntegrationId,
					address: "team@other.example",
				},
			}),
		).rejects.toThrow("could not be found");

		await setEmailIntegrationConnectionStatus(
			base,
			integrationId,
			"disconnected",
		);
		await expect(
			actor.mutation(api.email.inboxes.update, {
				inboxId,
				displayName: "Support",
				address: "support@example.com",
				outbound: {
					integrationId,
					address: "changed@verified.example",
				},
			}),
		).rejects.toThrow("Connect the email integration");
		expect(await base.run(async (ctx) => ctx.db.get(inboxId))).toMatchObject({
			outbound: {
				integrationId,
				address: "team@verified.example",
			},
		});

		await actor.mutation(api.email.inboxes.update, {
			inboxId,
			displayName: "Support",
			address: "support@example.com",
			outbound: null,
		});
		const inbox = await base.run(async (ctx) => ctx.db.get(inboxId));
		expect(inbox).not.toHaveProperty("outbound");
	});
});
