/// <reference types="vite/client" />

import { register as registerMigrationsTest } from "@convex-dev/migrations/test";
import workOSAuthKitTest from "@convex-dev/workos-authkit/test";
import { register as registerWorkpoolTest } from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { api, components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

export const modules = import.meta.glob([
	"./**/*.ts",
	"./_generated/*.js",
	"!./**/*.test.ts",
	"!./test.setup.ts",
]);

export function createTest() {
	const test = convexTest(schema, modules);
	workOSAuthKitTest.register(test);
	registerMigrationsTest(test);
	registerWorkpoolTest(test, "emailIngestWorkpool");
	registerWorkpoolTest(test, "emailOutboundWorkpool");
	return test;
}

export async function syncWorkosUser(
	test: ReturnType<typeof createTest>,
	{
		id,
		name,
		email,
	}: {
		id: string;
		name: string;
		email: string;
	},
) {
	await test.mutation(components.workOSAuthKit.lib.onWebhookEvent, {
		apiKey: "sk_test",
		event: {
			id: `event_${id}`,
			createdAt: "2026-01-01T00:00:00.000Z",
			event: "user.created",
			data: {
				id,
				email,
				name,
				emailVerified: true,
				metadata: {},
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
				object: "user",
			},
		},
	});
}

type TestFunctionClient = Pick<
	ReturnType<typeof createTest>,
	"mutation" | "run"
>;

export async function createActiveEmailInbox(
	test: TestFunctionClient,
	{
		address,
		displayName,
	}: {
		address: string;
		displayName: string;
	},
): Promise<Id<"emailInboxes">> {
	return await test.mutation(api.email.inboxes.create, {
		address,
		displayName,
	});
}

export async function createConnectedResendIntegration(
	test: TestFunctionClient,
	organizationId: Id<"organizations">,
	suffix = "resend",
) {
	return await test.run(async (ctx) =>
		ctx.db.insert("emailIntegrations", {
			organizationId,
			provider: "resend",
			status: "connected",
			workosOrganizationId: `org_${suffix}`,
			workosUserId: `user_${suffix}`,
			workosDataIntegrationId: `data_integration_${suffix}`,
			workosConnectedAccountId: `connected_account_${suffix}`,
			workosConnectedAccountUpdatedAt: Date.parse("2026-01-01T00:00:00.000Z"),
			webhookId: `wh_${suffix}`,
			webhookSecret: `whsec_${suffix}`,
			webhookProvisionedAt: Date.parse("2026-01-01T00:00:01.000Z"),
		}),
	);
}
