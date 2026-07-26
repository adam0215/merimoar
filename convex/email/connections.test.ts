import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

async function createOrganization(
	t: ReturnType<typeof convexTest>,
	slug = "merimoar",
) {
	return await t.run(async (ctx) =>
		ctx.db.insert("organizations", {
			name: "Merimoar",
			slug,
		}),
	);
}

describe("email connections", () => {
	it("creates an active, normalized Resend connection", async () => {
		const t = convexTest(schema, modules);
		const organizationId = await createOrganization(t);

		const connectionId = await t.mutation(api.email.connections.create, {
			organizationSlug: " merimoar ",
			provider: "resend",
			displayName: " Development inbox ",
			address: " Development@Ulkeahaedo.Resend.App ",
		});

		const connection = await t.run(async (ctx) =>
			ctx.db.get(connectionId),
		);

		expect(connection).toMatchObject({
			organizationId,
			provider: "resend",
			displayName: "Development inbox",
			address: "development@ulkeahaedo.resend.app",
			status: "active",
		});
	});

	it("does not connect an address more than once", async () => {
		const t = convexTest(schema, modules);
		await createOrganization(t);

		await t.mutation(api.email.connections.create, {
			organizationSlug: "merimoar",
			provider: "resend",
			displayName: "Primary inbox",
			address: "development@ulkeahaedo.resend.app",
		});

		await expect(
			t.mutation(api.email.connections.create, {
				organizationSlug: "merimoar",
				provider: "resend",
				displayName: "Duplicate inbox",
				address: "DEVELOPMENT@ULKEAHAEDO.RESEND.APP",
			}),
		).rejects.toThrow("This email address is already connected.");

		const connections = await t.run(async (ctx) =>
			ctx.db.query("emailConnections").collect(),
		);
		expect(connections).toHaveLength(1);
	});

	it("rejects invalid details and unknown organizations", async () => {
		const t = convexTest(schema, modules);
		await createOrganization(t);

		await expect(
			t.mutation(api.email.connections.create, {
				organizationSlug: "merimoar",
				provider: "resend",
				displayName: "D",
				address: "not-an-email",
			}),
		).rejects.toThrow();

		await expect(
			t.mutation(api.email.connections.create, {
				organizationSlug: "unknown",
				provider: "resend",
				displayName: "Development inbox",
				address: "development@ulkeahaedo.resend.app",
			}),
		).rejects.toThrow("The organization could not be found.");
	});
});
