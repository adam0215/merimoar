// fallow-ignore-file circular-dependency -- import.meta.glob creates false-positive cycles through test files.
/// <reference types="vite/client" />

import { register as registerActionCacheTest } from "@convex-dev/action-cache/test";
import { register as registerMigrationsTest } from "@convex-dev/migrations/test";
import workOSAuthKitTest from "@convex-dev/workos-authkit/test";
import { register as registerWorkpoolTest } from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import schema from "#/schema";
import { api, components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

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
	registerActionCacheTest(test);
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
		outbound: null,
	});
}

export async function createConnectedResendIntegration(
	test: TestFunctionClient,
	organizationId: Id<"organizations">,
	suffix = "resend",
) {
	return await test.run(async (ctx) => {
		return (await insertResendIntegration(ctx, organizationId, { suffix }))
			.integrationId;
	});
}

export async function setEmailIntegrationConnectionStatus(
	test: Pick<TestFunctionClient, "run">,
	integrationId: Id<"emailIntegrations">,
	connectionStatus: "connected" | "needs_reauthorization" | "disconnected",
) {
	await test.run(async (ctx) => {
		const integration = await ctx.db.get(integrationId);
		if (!integration) {
			throw new Error("Expected a connected account-backed email integration");
		}
		await ctx.db.patch(integration.connectedAccountId, { connectionStatus });
	});
}

export async function insertResendIntegration(
	ctx: Pick<MutationCtx, "db">,
	organizationId: Id<"organizations">,
	options: {
		connectionStatus?: "connected" | "needs_reauthorization" | "disconnected";
		hasWebhook?: boolean;
		suffix?: string;
		workosUpdatedAt?: number;
		workosUserId?: string;
	} = {},
) {
	const suffix = options.suffix ?? "resend";
	const connectionStatus = options.connectionStatus ?? "connected";
	const connectedAccountId = await ctx.db.insert("connectedAccounts", {
		organizationId,
		providerSlug: "resend",
		workosUserId: options.workosUserId ?? `user_${suffix}`,
		workosDataIntegrationId: `data_integration_${suffix}`,
		workosConnectedAccountId: `connected_account_${suffix}`,
		connectionStatus,
		grantedScopes: connectionStatus === "connected" ? ["full_access"] : [],
		workosUpdatedAt:
			options.workosUpdatedAt ?? Date.parse("2026-01-01T00:00:00.000Z"),
	});
	const integrationId = await ctx.db.insert("emailIntegrations", {
		connectedAccountId,
		resendWebhook:
			options.hasWebhook === false
				? undefined
				: {
						webhookId: `wh_${suffix}`,
						signingSecret: `whsec_${suffix}`,
						provisionedAt: Date.parse("2026-01-01T00:00:01.000Z"),
					},
	});
	return { connectedAccountId, integrationId };
}
