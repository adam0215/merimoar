import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { createTest, syncWorkosUser } from "../test.setup";

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
			active: true,
		});
		const otherOrganizationId = await ctx.db.insert("organizations", {
			name: "Other",
			workosOrganizationId: "org_other",
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
			}),
			actor.mutation(api.email.inboxes.create, {
				displayName: "Operations",
				address: "operations@example.com",
			}),
		]);

		expect(new Set(inboxIds).size).toBe(2);
		expect(await actor.query(api.email.reader.listInboxes, {})).toHaveLength(2);
	});

	it("scopes address uniqueness to the organization router", async () => {
		const { actor, otherActor } = await createFixture();
		await actor.mutation(api.email.inboxes.create, {
			displayName: "Primary support",
			address: "support@example.com",
		});
		await expect(
			actor.mutation(api.email.inboxes.create, {
				displayName: "Duplicate support",
				address: "SUPPORT@EXAMPLE.COM",
			}),
		).rejects.toThrow("already has an inbox");
		await expect(
			otherActor.mutation(api.email.inboxes.create, {
				displayName: "Other support",
				address: "support@example.com",
			}),
		).resolves.toBeDefined();
	});

	it("serializes concurrent attempts to create the same inbox", async () => {
		const { actor } = await createFixture();
		const results = await Promise.allSettled([
			actor.mutation(api.email.inboxes.create, {
				displayName: "First",
				address: "shared@example.com",
			}),
			actor.mutation(api.email.inboxes.create, {
				displayName: "Second",
				address: "SHARED@example.com",
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
			}),
		).rejects.toThrow("Use at least 2 characters.");
		await expect(
			base.mutation(api.email.inboxes.create, {
				displayName: "Support",
				address: "support@example.com",
			}),
		).rejects.toThrow("Sign in");
	});

	it("removes only inboxes owned by the active organization", async () => {
		const { actor, base, otherActor } = await createFixture();
		const inboxId = await actor.mutation(api.email.inboxes.create, {
			displayName: "Support",
			address: "support@example.com",
		});

		await expect(
			otherActor.mutation(api.email.inboxes.remove, { inboxId }),
		).rejects.toThrow("could not be found");
		await actor.mutation(api.email.inboxes.remove, { inboxId });
		expect(await base.run(async (ctx) => ctx.db.get(inboxId))).toMatchObject({
			status: "disabled",
		});
	});
});
