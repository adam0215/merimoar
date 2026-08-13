import { describe, expect, it } from "vitest";
import {
	createTest,
	insertResendIntegration,
	syncWorkosUser,
} from "#/test.setup";
import { api, internal } from "../_generated/api";

const INITIAL_UPDATED_AT = "2026-01-01T00:01:00.000Z";

async function processConnectedAccount(
	test: ReturnType<typeof createTest>,
	{
		connectedAccountId = "connected_account_resend",
		userId = "user_adam",
		dataIntegrationId = `data_integration_${userId}`,
		event = "pipes.connected_account.connected",
		eventId,
		providerSlug = "custom",
		resendDataIntegrationId = dataIntegrationId,
		scopes = ["full_access"],
		updatedAt = INITIAL_UPDATED_AT,
	}: {
		connectedAccountId?: string;
		dataIntegrationId?: string;
		event?:
			| "pipes.connected_account.connected"
			| "pipes.connected_account.disconnected"
			| "pipes.connected_account.reauthorization_needed";
		eventId: string;
		providerSlug?: string;
		resendDataIntegrationId?: string;
		scopes?: string[];
		updatedAt?: string;
		userId?: string;
	},
) {
	await test.mutation(internal.workos.processConnectedAccountWebhookEvent, {
		eventId,
		event,
		resendDataIntegrationId,
		data: {
			id: connectedAccountId,
			data_integration_id: dataIntegrationId,
			organization_id: "org_merimoar",
			provider_slug: providerSlug,
			scopes,
			updated_at: updatedAt,
			user_id: userId,
		},
	});
}

async function requireResendState(test: ReturnType<typeof createTest>) {
	const state = await test.run(async (ctx) => ({
		account: await ctx.db.query("connectedAccounts").first(),
		integration: await ctx.db.query("emailIntegrations").first(),
	}));
	const { account, integration } = state;
	if (!account || !integration) {
		throw new Error("Expected a connected Resend integration");
	}
	return { account, integration };
}

async function connectResend(test: ReturnType<typeof createTest>) {
	await processConnectedAccount(test, { eventId: "event_connected" });
	return await requireResendState(test);
}

function provisioningFence(
	state: Awaited<ReturnType<typeof requireResendState>>,
) {
	return {
		integrationId: state.integration._id,
		expectedConnectedAccountId: state.account._id,
		expectedWorkosUpdatedAt: state.account.workosUpdatedAt,
	};
}

describe("email integrations", () => {
	it("keeps two users in one organization isolated by connected account", async () => {
		const test = createTest();
		await Promise.all([
			processConnectedAccount(test, {
				connectedAccountId: "connected_account_adam",
				eventId: "event_adam",
				userId: "user_adam",
			}),
			processConnectedAccount(test, {
				connectedAccountId: "connected_account_sara",
				eventId: "event_sara",
				userId: "user_sara",
			}),
		]);

		const state = await test.run(async (ctx) => ({
			accounts: await ctx.db.query("connectedAccounts").collect(),
			integrations: await ctx.db.query("emailIntegrations").collect(),
		}));
		expect(state.accounts).toHaveLength(2);
		expect(
			new Set(state.accounts.map((account) => account.workosUserId)),
		).toEqual(new Set(["user_adam", "user_sara"]));
		expect(
			new Set(
				state.integrations.map((integration) => integration.connectedAccountId),
			),
		).toEqual(new Set(state.accounts.map((account) => account._id)));
	});

	it("reports the current account after a disconnected account is replaced", async () => {
		const test = createTest();
		await syncWorkosUser(test, {
			id: "user_adam",
			name: "Adam",
			email: "adam@merimoar.com",
		});
		await test.run(async (ctx) => {
			const id = await ctx.db.insert("organizations", {
				name: "Merimoar",
				workosOrganizationId: "org_merimoar",
				referenceSlug: "MER",
				active: true,
			});
			await ctx.db.insert("organizationMembers", {
				organizationId: id,
				workosUserId: "user_adam",
				active: true,
			});
			await insertResendIntegration(ctx, id, {
				suffix: "replacement",
				workosUserId: "user_adam",
				workosUpdatedAt: 3_000,
			});
			await insertResendIntegration(ctx, id, {
				connectionStatus: "disconnected",
				hasWebhook: false,
				suffix: "historical",
				workosUserId: "user_adam",
				workosUpdatedAt: 2_000,
			});
		});
		const actor = test.withIdentity({
			issuer: "https://api.workos.com/",
			subject: "user_adam",
			org_id: "org_merimoar",
		});

		expect(
			await actor.query(api.email.integrations.getResendConnectionOverview, {}),
		).toEqual({
			connectionStatus: "connected",
			inboundReadiness: "ready",
			outboundReadiness: "ready",
		});
		expect(
			await actor.query(api.email.reader.listOutboundIntegrations, {}),
		).toEqual(
			expect.arrayContaining([
				{
					integrationId: expect.any(String),
					provider: "resend",
					connectionStatus: "connected",
					outboundReadiness: "ready",
				},
			]),
		);
	});

	it("rejects stale snapshots and fences webhook activation", async () => {
		const test = createTest();
		const initial = await connectResend(test);
		const accountId = initial.account._id;

		await processConnectedAccount(test, {
			event: "pipes.connected_account.reauthorization_needed",
			eventId: "event_reauthorization",
			updatedAt: "2026-01-01T00:02:00.000Z",
		});
		await processConnectedAccount(test, {
			eventId: "event_stale",
			updatedAt: "2026-01-01T00:00:30.000Z",
		});

		expect(
			await test.mutation(internal.email.integrations.activateResendWebhook, {
				...provisioningFence(initial),
				webhookId: "wh_stale",
				webhookSecret: "whsec_stale",
			}),
		).toBe(false);
		expect(await test.run(async (ctx) => ctx.db.get(accountId))).toMatchObject({
			connectionStatus: "needs_reauthorization",
			workosUpdatedAt: Date.parse("2026-01-01T00:02:00.000Z"),
		});
	});

	it("does not let a stale token failure overwrite a newer connection", async () => {
		const test = createTest();
		const initial = await connectResend(test);
		const accountId = initial.account._id;
		await processConnectedAccount(test, {
			eventId: "event_new_connection",
			updatedAt: "2026-01-01T00:02:00.000Z",
		});
		await test.mutation(internal.email.integrations.recordWorkosAccessFailure, {
			...provisioningFence(initial),
			error: "needs_reauthorization",
		});

		expect(await test.run(async (ctx) => ctx.db.get(accountId))).toMatchObject({
			connectionStatus: "connected",
			workosUpdatedAt: Date.parse("2026-01-01T00:02:00.000Z"),
		});
	});

	it("keeps WorkOS connected when Resend is missing full_access", async () => {
		const test = createTest();
		await processConnectedAccount(test, {
			connectedAccountId: "connected_account_send_only",
			eventId: "event_send_only",
			scopes: ["emails:send"],
		});

		const state = await requireResendState(test);
		expect(state.account).toMatchObject({
			connectionStatus: "connected",
			grantedScopes: ["emails:send"],
		});
		expect(state.integration.resendWebhook).toBeUndefined();
	});

	it("rotates a disconnected webhook into durable immutable cleanup", async () => {
		const test = createTest();
		const initial = await connectResend(test);
		const integrationId = initial.integration._id;
		await test.mutation(internal.email.integrations.activateResendWebhook, {
			...provisioningFence(initial),
			webhookId: "wh_resend",
			webhookSecret: "whsec_resend",
		});
		await processConnectedAccount(test, {
			event: "pipes.connected_account.disconnected",
			eventId: "event_disconnected",
			updatedAt: "2026-01-01T00:02:00.000Z",
		});

		const state = await test.run(async (ctx) => ({
			integration: await ctx.db.get(integrationId),
			cleanupTask: await ctx.db
				.query("emailIntegrationWebhookCleanupTasks")
				.first(),
		}));
		expect(state.integration?.resendWebhook).toBeUndefined();
		expect(state.cleanupTask).toMatchObject({
			integrationId: initial.integration._id,
			webhookId: "wh_resend",
			workosOrganizationId: "org_merimoar",
			workosUserId: "user_adam",
		});
		expect(
			await test.query(
				internal.email.integrations.getWebhookVerificationContext,
				{ integrationId: initial.integration._id },
			),
		).toBeNull();
	});

	it("keeps cleanup pinned to the old webhook across reauthorization", async () => {
		const test = createTest();
		const initial = await connectResend(test);
		const connectedAccountId = initial.account._id;
		const integrationId = initial.integration._id;
		await test.mutation(internal.email.integrations.activateResendWebhook, {
			...provisioningFence(initial),
			webhookId: "wh_old",
			webhookSecret: "whsec_old",
		});
		await processConnectedAccount(test, {
			event: "pipes.connected_account.reauthorization_needed",
			eventId: "event_reauthorization",
			updatedAt: "2026-01-01T00:02:00.000Z",
		});
		await processConnectedAccount(test, {
			eventId: "event_reconnected",
			updatedAt: "2026-01-01T00:03:00.000Z",
		});
		const reconnectedAccount = await test.run(async (ctx) =>
			ctx.db.get(connectedAccountId),
		);
		if (!reconnectedAccount) {
			throw new Error("Expected the reconnected account");
		}
		await test.mutation(internal.email.integrations.activateResendWebhook, {
			integrationId,
			expectedConnectedAccountId: reconnectedAccount._id,
			expectedWorkosUpdatedAt: reconnectedAccount.workosUpdatedAt,
			webhookId: "wh_new",
			webhookSecret: "whsec_new",
		});

		const state = await test.run(async (ctx) => ({
			integration: await ctx.db.get(integrationId),
			cleanupTask: await ctx.db
				.query("emailIntegrationWebhookCleanupTasks")
				.first(),
		}));
		expect(state.integration?.resendWebhook?.webhookId).toBe("wh_new");
		expect(state.cleanupTask).toMatchObject({
			webhookId: "wh_old",
			workosOrganizationId: "org_merimoar",
			workosUserId: "user_adam",
		});
	});

	it("lets only one concurrent webhook win and deduplicates loser cleanup", async () => {
		const test = createTest();
		const state = await connectResend(test);
		const fence = provisioningFence(state);
		expect(
			await test.mutation(internal.email.integrations.activateResendWebhook, {
				...fence,
				webhookId: "wh_winner",
				webhookSecret: "whsec_winner",
			}),
		).toBe(true);
		expect(
			await test.mutation(internal.email.integrations.activateResendWebhook, {
				...fence,
				webhookId: "wh_loser",
				webhookSecret: "whsec_loser",
			}),
		).toBe(false);

		const firstTaskId = await test.mutation(
			internal.email.integrations.createWebhookCleanupTask,
			{ integrationId: state.integration._id, webhookId: "wh_loser" },
		);
		const secondTaskId = await test.mutation(
			internal.email.integrations.createWebhookCleanupTask,
			{ integrationId: state.integration._id, webhookId: "wh_loser" },
		);
		expect(secondTaskId).toBe(firstTaskId);
	});

	it("replaces only the exact webhook confirmed missing by Resend", async () => {
		const test = createTest();
		const state = await connectResend(test);
		const integrationId = state.integration._id;
		const fence = provisioningFence(state);
		await test.mutation(internal.email.integrations.activateResendWebhook, {
			...fence,
			webhookId: "wh_missing",
			webhookSecret: "whsec_missing",
		});

		expect(
			await test.mutation(
				internal.email.integrations.clearConfirmedMissingResendWebhook,
				{ ...fence, webhookId: "wh_different" },
			),
		).toBe(false);
		expect(
			await test.mutation(
				internal.email.integrations.clearConfirmedMissingResendWebhook,
				{
					...fence,
					expectedWorkosUpdatedAt: fence.expectedWorkosUpdatedAt - 1,
					webhookId: "wh_missing",
				},
			),
		).toBe(false);
		expect(
			await test.mutation(
				internal.email.integrations.clearConfirmedMissingResendWebhook,
				{ ...fence, webhookId: "wh_missing" },
			),
		).toBe(true);
		expect(
			await test.query(
				internal.email.integrations.getWebhookVerificationContext,
				{ integrationId },
			),
		).toBeNull();
		expect(
			await test.mutation(internal.email.integrations.activateResendWebhook, {
				...fence,
				webhookId: "wh_replacement",
				webhookSecret: "whsec_replacement",
			}),
		).toBe(true);
		expect(
			await test.run(async (ctx) => ctx.db.get(integrationId)),
		).toMatchObject({
			resendWebhook: { webhookId: "wh_replacement" },
		});
	});
});
