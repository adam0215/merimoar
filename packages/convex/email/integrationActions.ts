"use node";

import { v } from "convex/values";
import { Resend } from "resend";
import { fetchResendAccess } from "#/email/resendAccess";
import { resendProvisioningFenceValidator } from "#/integrations/model";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";

const MAX_RETRY_DELAY_MS = 60 * 60 * 1_000;
const CLEANUP_LEASE_MS = 15 * 60 * 1_000;

function retryDelay(attempt: number) {
	return Math.min(5_000 * 2 ** Math.min(attempt, 10), MAX_RETRY_DELAY_MS);
}

async function deleteResendWebhook(resend: Resend, webhookId: string) {
	try {
		const result = await resend.webhooks.remove(webhookId);
		return result.error === null
			? result.data.deleted
			: result.error.name === "not_found";
	} catch {
		return false;
	}
}

async function scheduleWebhookCleanup(
	ctx: ActionCtx,
	integrationId: Id<"emailIntegrations">,
	webhookId: string,
) {
	const taskId = await ctx.runMutation(
		internal.email.integrations.createWebhookCleanupTask,
		{ integrationId, webhookId },
	);
	await ctx.scheduler.runAfter(
		0,
		internal.email.integrationActions.retryWebhookCleanup,
		{ taskId },
	);
}

export const reconcileResendWebhook = internalAction({
	args: {
		...resendProvisioningFenceValidator.fields,
		attempt: v.number(),
	},
	handler: async (ctx, args): Promise<null> => {
		const context = await ctx.runQuery(
			internal.email.integrations.getResendProvisioningContext,
			{
				integrationId: args.integrationId,
				expectedConnectedAccountId: args.expectedConnectedAccountId,
				expectedWorkosUpdatedAt: args.expectedWorkosUpdatedAt,
			},
		);
		if (!context) {
			return null;
		}

		let resend: Resend | undefined;
		let createdWebhookId: string | undefined;
		try {
			const access = await fetchResendAccess(context);
			if (!access.active) {
				if (access.error !== "missing_required_scope") {
					await ctx.runMutation(
						internal.email.integrations.recordWorkosAccessFailure,
						{
							integrationId: args.integrationId,
							expectedConnectedAccountId: args.expectedConnectedAccountId,
							expectedWorkosUpdatedAt: args.expectedWorkosUpdatedAt,
							error: access.error,
						},
					);
				}
				return null;
			}

			resend = new Resend(access.token);
			if (context.resendWebhook) {
				const updatedWebhook = await resend.webhooks.update(
					context.resendWebhook.webhookId,
					{
						endpoint: `${process.env.CONVEX_SITE_URL}/webhooks/email/resend/${args.integrationId}`,
						events: ["email.received", "email.sent"],
						status: "enabled",
					},
				);
				if (!updatedWebhook.error && updatedWebhook.data) {
					return null;
				}
				if (updatedWebhook.error?.name !== "not_found") {
					throw new Error("Resend rejected webhook reconciliation");
				}
				const cleared = await ctx.runMutation(
					internal.email.integrations.clearConfirmedMissingResendWebhook,
					{
						integrationId: args.integrationId,
						expectedConnectedAccountId: args.expectedConnectedAccountId,
						expectedWorkosUpdatedAt: args.expectedWorkosUpdatedAt,
						webhookId: context.resendWebhook.webhookId,
					},
				);
				if (!cleared) {
					return null;
				}
			}
			const webhook = await resend.webhooks.create({
				endpoint: `${process.env.CONVEX_SITE_URL}/webhooks/email/resend/${args.integrationId}`,
				events: ["email.received", "email.sent"],
			});
			if (webhook.error || !webhook.data) {
				throw new Error("Resend rejected webhook provisioning");
			}
			createdWebhookId = webhook.data.id;

			const activated = await ctx.runMutation(
				internal.email.integrations.activateResendWebhook,
				{
					integrationId: args.integrationId,
					expectedConnectedAccountId: args.expectedConnectedAccountId,
					expectedWorkosUpdatedAt: args.expectedWorkosUpdatedAt,
					webhookId: webhook.data.id,
					webhookSecret: webhook.data.signing_secret,
				},
			);
			if (!activated && !(await deleteResendWebhook(resend, webhook.data.id))) {
				await scheduleWebhookCleanup(ctx, args.integrationId, webhook.data.id);
			}
		} catch {
			if (
				createdWebhookId &&
				resend &&
				!(await deleteResendWebhook(resend, createdWebhookId))
			) {
				await scheduleWebhookCleanup(ctx, args.integrationId, createdWebhookId);
			}
			await ctx.scheduler.runAfter(
				retryDelay(args.attempt),
				internal.email.integrationActions.reconcileResendWebhook,
				{ ...args, attempt: args.attempt + 1 },
			);
		}
		return null;
	},
});

export const retryWebhookCleanup = internalAction({
	args: {
		taskId: v.id("emailIntegrationWebhookCleanupTasks"),
	},
	handler: async (ctx, args): Promise<null> => {
		const context = await ctx.runQuery(
			internal.email.integrations.getWebhookCleanupContext,
			args,
		);
		if (!context) {
			return null;
		}

		let deleted = false;
		try {
			const access = await fetchResendAccess(context);
			deleted =
				access.active &&
				(await deleteResendWebhook(
					new Resend(access.token),
					context.webhookId,
				));
		} catch {
			deleted = false;
		}
		if (deleted) {
			await ctx.runMutation(
				internal.email.integrations.completeWebhookCleanup,
				args,
			);
			return null;
		}

		const nextAttemptAt = Date.now() + retryDelay(context.attempts);
		await ctx.runMutation(
			internal.email.integrations.recordWebhookCleanupAttempt,
			{ taskId: args.taskId, nextAttemptAt },
		);
		await ctx.scheduler.runAt(
			nextAttemptAt,
			internal.email.integrationActions.retryWebhookCleanup,
			args,
		);
		return null;
	},
});

export const sweepWebhookCleanupTasks = internalAction({
	args: {},
	handler: async (ctx): Promise<null> => {
		const now = Date.now();
		const taskIds = await ctx.runMutation(
			internal.email.integrations.claimDueWebhookCleanupTasks,
			{
				now,
				leaseUntil: now + CLEANUP_LEASE_MS,
			},
		);
		await Promise.all(
			taskIds.map((taskId) =>
				ctx.scheduler.runAfter(
					0,
					internal.email.integrationActions.retryWebhookCleanup,
					{ taskId },
				),
			),
		);
		if (taskIds.length === 50) {
			await ctx.scheduler.runAfter(
				0,
				internal.email.integrationActions.sweepWebhookCleanupTasks,
				{},
			);
		}
		return null;
	},
});
