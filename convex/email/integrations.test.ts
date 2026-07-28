import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { createTest } from "../test.setup";

function pipesData({
	connectedAccountId,
	updatedAt,
	userId,
}: {
	connectedAccountId: string;
	updatedAt: string;
	userId: string;
}) {
	return {
		id: connectedAccountId,
		data_integration_id: "data_integration_resend",
		organization_id: "org_merimoar",
		provider_slug: "resend",
		scopes: ["full_access"],
		updated_at: updatedAt,
		user_id: userId,
	};
}

async function processConnectedAccount(
	test: ReturnType<typeof createTest>,
	{
		connectedAccountId,
		event,
		eventId,
		updatedAt,
		userId,
	}: {
		connectedAccountId: string;
		event:
			| "pipes.connected_account.connected"
			| "pipes.connected_account.disconnected"
			| "pipes.connected_account.reauthorization_needed";
		eventId: string;
		updatedAt: string;
		userId: string;
	},
) {
	await test.mutation(internal.workos.processPipesWebhookEvent, {
		eventId,
		event,
		data: pipesData({ connectedAccountId, updatedAt, userId }),
	});
}

describe("email integrations", () => {
	it("keeps concurrent service connections isolated by connected account", async () => {
		const test = createTest();
		await Promise.all([
			processConnectedAccount(test, {
				connectedAccountId: "connected_account_adam",
				event: "pipes.connected_account.connected",
				eventId: "event_adam",
				updatedAt: "2026-01-01T00:01:00.000Z",
				userId: "user_adam",
			}),
			processConnectedAccount(test, {
				connectedAccountId: "connected_account_sara",
				event: "pipes.connected_account.connected",
				eventId: "event_sara",
				updatedAt: "2026-01-01T00:01:00.000Z",
				userId: "user_sara",
			}),
		]);

		const integrations = await test.run(async (ctx) =>
			ctx.db.query("emailIntegrations").collect(),
		);
		expect(integrations).toHaveLength(2);
		expect(
			new Set(integrations.map((integration) => integration.workosUserId)),
		).toEqual(new Set(["user_adam", "user_sara"]));
	});

	it("rejects stale snapshots and fences webhook activation", async () => {
		const test = createTest();
		await processConnectedAccount(test, {
			connectedAccountId: "connected_account_resend",
			event: "pipes.connected_account.connected",
			eventId: "event_connected",
			updatedAt: "2026-01-01T00:01:00.000Z",
			userId: "user_adam",
		});
		const integration = await test.run(async (ctx) =>
			ctx.db.query("emailIntegrations").first(),
		);
		if (!integration) {
			throw new Error("Expected an email integration");
		}

		await processConnectedAccount(test, {
			connectedAccountId: "connected_account_resend",
			event: "pipes.connected_account.reauthorization_needed",
			eventId: "event_reauthorization",
			updatedAt: "2026-01-01T00:02:00.000Z",
			userId: "user_adam",
		});
		await processConnectedAccount(test, {
			connectedAccountId: "connected_account_resend",
			event: "pipes.connected_account.connected",
			eventId: "event_stale",
			updatedAt: "2026-01-01T00:00:30.000Z",
			userId: "user_adam",
		});

		expect(
			await test.mutation(internal.email.integrations.activateResendWebhook, {
				integrationId: integration._id,
				expectedConnectedAccountUpdatedAt: Date.parse(
					"2026-01-01T00:01:00.000Z",
				),
				webhookId: "wh_stale",
				webhookSecret: "whsec_stale",
			}),
		).toBe(false);
		expect(
			await test.run(async (ctx) => ctx.db.get(integration._id)),
		).toMatchObject({
			status: "needs_reauthorization",
			workosConnectedAccountUpdatedAt: Date.parse("2026-01-01T00:02:00.000Z"),
		});
	});

	it("does not let a stale token failure overwrite a newer connection", async () => {
		const test = createTest();
		await processConnectedAccount(test, {
			connectedAccountId: "connected_account_resend",
			event: "pipes.connected_account.connected",
			eventId: "event_first_connection",
			updatedAt: "2026-01-01T00:01:00.000Z",
			userId: "user_adam",
		});
		const integration = await test.run(async (ctx) =>
			ctx.db.query("emailIntegrations").first(),
		);
		if (!integration) {
			throw new Error("Expected an email integration");
		}

		await processConnectedAccount(test, {
			connectedAccountId: "connected_account_resend",
			event: "pipes.connected_account.connected",
			eventId: "event_new_connection",
			updatedAt: "2026-01-01T00:02:00.000Z",
			userId: "user_adam",
		});
		await test.mutation(internal.email.integrations.markNeedsReauthorization, {
			integrationId: integration._id,
			expectedConnectedAccountUpdatedAt: Date.parse("2026-01-01T00:01:00.000Z"),
		});

		expect(
			await test.run(async (ctx) => ctx.db.get(integration._id)),
		).toMatchObject({
			status: "connected",
			workosConnectedAccountUpdatedAt: Date.parse("2026-01-01T00:02:00.000Z"),
		});
	});

	it("keeps webhook verification state while an integration is disconnected", async () => {
		const test = createTest();
		await processConnectedAccount(test, {
			connectedAccountId: "connected_account_resend",
			event: "pipes.connected_account.connected",
			eventId: "event_connected",
			updatedAt: "2026-01-01T00:01:00.000Z",
			userId: "user_adam",
		});
		const integration = await test.run(async (ctx) =>
			ctx.db.query("emailIntegrations").first(),
		);
		if (!integration) {
			throw new Error("Expected an email integration");
		}
		await test.mutation(internal.email.integrations.activateResendWebhook, {
			integrationId: integration._id,
			expectedConnectedAccountUpdatedAt:
				integration.workosConnectedAccountUpdatedAt,
			webhookId: "wh_resend",
			webhookSecret: "whsec_resend",
		});
		await processConnectedAccount(test, {
			connectedAccountId: "connected_account_resend",
			event: "pipes.connected_account.disconnected",
			eventId: "event_disconnected",
			updatedAt: "2026-01-01T00:02:00.000Z",
			userId: "user_adam",
		});

		expect(
			await test.query(
				internal.email.integrations.getWebhookVerificationContext,
				{ integrationId: integration._id },
			),
		).toMatchObject({
			acceptsEmail: false,
			webhookSecret: "whsec_resend",
		});
	});

	it("persists and advances webhook cleanup work idempotently", async () => {
		const test = createTest();
		const integrationId = await test.run(async (ctx) => {
			const organizationId = await ctx.db.insert("organizations", {
				name: "Merimoar",
				workosOrganizationId: "org_merimoar",
				active: true,
			});
			return await ctx.db.insert("emailIntegrations", {
				organizationId,
				provider: "resend",
				status: "connected",
				workosOrganizationId: "org_merimoar",
				workosUserId: "user_adam",
				workosDataIntegrationId: "data_integration_resend",
				workosConnectedAccountId: "connected_account_resend",
				workosConnectedAccountUpdatedAt: 1_000,
			});
		});

		const firstTaskId = await test.mutation(
			internal.email.integrations.createWebhookCleanupTask,
			{ integrationId, webhookId: "wh_orphan" },
		);
		const secondTaskId = await test.mutation(
			internal.email.integrations.createWebhookCleanupTask,
			{ integrationId, webhookId: "wh_orphan" },
		);
		expect(secondTaskId).toBe(firstTaskId);

		await test.mutation(
			internal.email.integrations.recordWebhookCleanupAttempt,
			{ taskId: firstTaskId, nextAttemptAt: 5_000 },
		);
		expect(
			await test.query(internal.email.integrations.getWebhookCleanupContext, {
				taskId: firstTaskId,
			}),
		).toMatchObject({ attempts: 1, webhookId: "wh_orphan" });

		expect(
			await test.mutation(
				internal.email.integrations.claimDueWebhookCleanupTasks,
				{ now: 5_000, leaseUntil: 20_000 },
			),
		).toEqual([firstTaskId]);
		expect(
			await test.mutation(
				internal.email.integrations.claimDueWebhookCleanupTasks,
				{ now: 5_000, leaseUntil: 20_000 },
			),
		).toEqual([]);

		await test.mutation(internal.email.integrations.completeWebhookCleanup, {
			taskId: firstTaskId,
		});
		expect(
			await test.query(internal.email.integrations.getWebhookCleanupContext, {
				taskId: firstTaskId,
			}),
		).toBeNull();
	});
});
