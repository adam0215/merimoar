import { describe, expect, it } from "vitest";
import { createTest, insertResendIntegration } from "#/test.setup";
import { internal } from "../_generated/api";

const MIGRATION_ARGS = {
	oneBatchOnly: true,
	cursor: null,
	dryRun: false,
} as const;

async function insertOrganization(test: ReturnType<typeof createTest>) {
	return await test.run(async (ctx) =>
		ctx.db.insert("organizations", {
			name: "Validation organization",
			workosOrganizationId: "org_validation",
			referenceSlug: "VALIDATION",
			active: true,
		}),
	);
}

describe("connected account data validation", () => {
	it("accepts the normalized one-to-one Resend relation", async () => {
		const test = createTest();
		const organizationId = await insertOrganization(test);
		await test.run(async (ctx) => {
			await insertResendIntegration(ctx, organizationId);
		});

		await expect(
			test.mutation(
				internal.migrations.validateConnectedAccountSplit,
				MIGRATION_ARGS,
			),
		).resolves.toBeDefined();
		expect(
			await test.query(internal.migrations.verifyConnectedAccountSplit, {}),
		).toMatchObject({ complete: true, invalidEmailIntegrationIds: [] });
	});

	it("rejects multiple email integrations for one connected account", async () => {
		const test = createTest();
		const organizationId = await insertOrganization(test);
		const { connectedAccountId } = await test.run(async (ctx) =>
			insertResendIntegration(ctx, organizationId),
		);
		await test.run(async (ctx) => {
			await ctx.db.insert("emailIntegrations", { connectedAccountId });
		});

		await expect(
			test.mutation(
				internal.migrations.validateConnectedAccountSplit,
				MIGRATION_ARGS,
			),
		).rejects.toThrow("unique() query returned more than one result");
	});

	it("rejects an outbound integration across organizations", async () => {
		const test = createTest();
		const organizationId = await insertOrganization(test);
		const { integrationId } = await test.run(async (ctx) =>
			insertResendIntegration(ctx, organizationId),
		);
		await test.run(async (ctx) => {
			const foreignOrganizationId = await ctx.db.insert("organizations", {
				name: "Foreign organization",
				workosOrganizationId: "org_foreign",
				referenceSlug: "FOREIGN",
				active: true,
			});
			await ctx.db.insert("emailInboxes", {
				organizationId: foreignOrganizationId,
				displayName: "Foreign inbox",
				address: "foreign@example.com",
				status: "active",
				unreadThreadCount: 0,
				outbound: { integrationId, address: "foreign@example.com" },
			});
		});

		await expect(
			test.mutation(
				internal.migrations.validateEmailInboxIntegrationReferences,
				MIGRATION_ARGS,
			),
		).rejects.toThrow("crosses an integration organization boundary");
	});
});
