import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

// TEST FIXTURES: The Merimoar organization, people, emails, and WorkOS-style
// identifiers below exist only in convex-test's isolated in-memory database.
const ISSUER = "https://api.workos.com/";

async function createFixture() {
	const base = convexTest(schema, modules);
	const { organizationId, otherOrganizationId } = await base.run(
		async (ctx) => {
			const organizationId = await ctx.db.insert("organizations", {
				name: "Merimoar",
				slug: "merimoar",
				workosOrganizationId: "org_merimoar",
			});
			const otherOrganizationId = await ctx.db.insert("organizations", {
				name: "Other",
				slug: "other",
				workosOrganizationId: "org_other",
			});
			await ctx.db.insert("organizationMembers", {
				organizationId,
				name: "Adam",
				email: "adam@merimoar.com",
				tokenIdentifier: `${ISSUER}|user_adam`,
				status: "active",
			});
			await ctx.db.insert("organizationMembers", {
				organizationId: otherOrganizationId,
				name: "Other",
				email: "other@example.com",
				tokenIdentifier: `${ISSUER}|user_other`,
				status: "active",
			});
			return { organizationId, otherOrganizationId };
		},
	);

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
		otherOrganizationId,
	};
}

describe("email connections", () => {
	it("creates an active, normalized Resend connection", async () => {
		const { actor, organizationId } = await createFixture();

		const connectionId = await actor.mutation(api.email.connections.create, {
			provider: "resend",
			displayName: " Development inbox ",
			address: " Development@Ulkeahaedo.Resend.App ",
		});

		const connection = await actor.run(async (ctx) => ctx.db.get(connectionId));

		expect(connection).toMatchObject({
			organizationId,
			provider: "resend",
			displayName: "Development inbox",
			address: "development@ulkeahaedo.resend.app",
			status: "active",
		});
	});

	it("does not connect an address more than once", async () => {
		const { actor } = await createFixture();

		await actor.mutation(api.email.connections.create, {
			provider: "resend",
			displayName: "Primary inbox",
			address: "development@ulkeahaedo.resend.app",
		});

		await expect(
			actor.mutation(api.email.connections.create, {
				provider: "resend",
				displayName: "Duplicate inbox",
				address: "DEVELOPMENT@ULKEAHAEDO.RESEND.APP",
			}),
		).rejects.toThrow("This email address is already connected.");

		const connections = await actor.run(async (ctx) =>
			ctx.db.query("emailConnections").collect(),
		);
		expect(connections).toHaveLength(1);
	});

	it("rejects invalid details and unauthenticated creation", async () => {
		const { actor, base } = await createFixture();

		await expect(
			actor.mutation(api.email.connections.create, {
				provider: "resend",
				displayName: "D",
				address: "not-an-email",
			}),
		).rejects.toThrow();

		await expect(
			base.mutation(api.email.connections.create, {
				provider: "resend",
				displayName: "Development inbox",
				address: "development@ulkeahaedo.resend.app",
			}),
		).rejects.toThrow("Sign in");
	});

	it("removes a connection without orphaning its email and can reactivate it", async () => {
		const { actor } = await createFixture();

		const connectionId = await actor.mutation(api.email.connections.create, {
			provider: "resend",
			displayName: "Development inbox",
			address: "development@ulkeahaedo.resend.app",
		});

		await actor.mutation(api.email.connections.remove, { connectionId });

		expect(
			await actor.run(async (ctx) => ctx.db.get(connectionId)),
		).toMatchObject({ status: "disabled" });

		const reactivatedConnectionId = await actor.mutation(
			api.email.connections.create,
			{
				provider: "resend",
				displayName: "Reactivated inbox",
				address: "development@ulkeahaedo.resend.app",
			},
		);

		expect(reactivatedConnectionId).toBe(connectionId);
		expect(
			await actor.run(async (ctx) => ctx.db.get(connectionId)),
		).toMatchObject({
			displayName: "Reactivated inbox",
			status: "active",
		});
	});

	it("does not let another organization remove a connection", async () => {
		const { actor, otherActor } = await createFixture();
		const connectionId = await actor.mutation(api.email.connections.create, {
			provider: "resend",
			displayName: "Development inbox",
			address: "development@ulkeahaedo.resend.app",
		});

		await expect(
			otherActor.mutation(api.email.connections.remove, { connectionId }),
		).rejects.toThrow("could not be found");
	});
});
