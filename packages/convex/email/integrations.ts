import { v } from "convex/values";
import { requireActor } from "#/auth/access";
import {
	getEmailIntegrationAccessContext,
	synchronizeResendEmailIntegration,
} from "#/integrations/connectedAccounts";
import {
	connectionStatusValidator,
	deriveEmailReadiness,
	type EmailIntegrationAccessContext,
	emailIntegrationAccessContextValidator,
	emailReadinessValidator,
	type ResendProvisioningFence,
	resendProvisioningFenceValidator,
} from "#/integrations/model";
import {
	getResendPipesProviderSlug,
	isResendPipesProviderSlug,
} from "#/integrations/resendProvider";
import { internalMutation, internalQuery, query } from "../_generated/server";

function matchesResendProvisioningFence(
	context: EmailIntegrationAccessContext,
	fence: ResendProvisioningFence,
) {
	return (
		isResendPipesProviderSlug(context.providerSlug) &&
		context.connectedAccountId === fence.expectedConnectedAccountId &&
		context.connectionStatus === "connected" &&
		context.workosUpdatedAt === fence.expectedWorkosUpdatedAt &&
		context.grantedScopes.includes("full_access")
	);
}

export const getResendProvisioningContext = internalQuery({
	args: resendProvisioningFenceValidator.fields,
	returns: v.union(emailIntegrationAccessContextValidator, v.null()),
	handler: async (ctx, args) => {
		const context = await getEmailIntegrationAccessContext(
			ctx,
			args.integrationId,
		);
		if (!context || !matchesResendProvisioningFence(context, args)) {
			return null;
		}
		return context;
	},
});

export const getOutboundAccessContext = internalQuery({
	args: {
		integrationId: v.id("emailIntegrations"),
	},
	returns: v.union(emailIntegrationAccessContextValidator, v.null()),
	handler: async (ctx, args) => {
		return await getEmailIntegrationAccessContext(ctx, args.integrationId);
	},
});

export const getSelectableResendAccessContext = internalQuery({
	args: {
		integrationId: v.id("emailIntegrations"),
	},
	returns: v.union(emailIntegrationAccessContextValidator, v.null()),
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		const context = await getEmailIntegrationAccessContext(
			ctx,
			args.integrationId,
		);
		if (
			!context ||
			context.organizationId !== workspace.organization._id ||
			!isResendPipesProviderSlug(context.providerSlug) ||
			deriveEmailReadiness(
				context.connectionStatus,
				context.grantedScopes,
				context.resendWebhook !== undefined,
			).outbound !== "ready"
		) {
			return null;
		}
		return context;
	},
});

export const activateResendWebhook = internalMutation({
	args: {
		...resendProvisioningFenceValidator.fields,
		webhookId: v.string(),
		webhookSecret: v.string(),
	},
	returns: v.boolean(),
	handler: async (ctx, args) => {
		const context = await getEmailIntegrationAccessContext(
			ctx,
			args.integrationId,
		);
		if (
			!context ||
			!matchesResendProvisioningFence(context, args) ||
			context.resendWebhook !== undefined
		) {
			return false;
		}

		await ctx.db.patch(args.integrationId, {
			resendWebhook: {
				webhookId: args.webhookId,
				signingSecret: args.webhookSecret,
				provisionedAt: Date.now(),
			},
		});
		return true;
	},
});

export const clearConfirmedMissingResendWebhook = internalMutation({
	args: {
		...resendProvisioningFenceValidator.fields,
		webhookId: v.string(),
	},
	returns: v.boolean(),
	handler: async (ctx, args) => {
		const context = await getEmailIntegrationAccessContext(
			ctx,
			args.integrationId,
		);
		if (
			!context ||
			!matchesResendProvisioningFence(context, args) ||
			context.resendWebhook?.webhookId !== args.webhookId
		) {
			return false;
		}

		await ctx.db.patch(args.integrationId, { resendWebhook: undefined });
		return true;
	},
});

export const recordWorkosAccessFailure = internalMutation({
	args: {
		integrationId: v.id("emailIntegrations"),
		expectedConnectedAccountId: v.id("connectedAccounts"),
		expectedWorkosUpdatedAt: v.number(),
		error: v.union(
			v.literal("needs_reauthorization"),
			v.literal("not_installed"),
		),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const context = await getEmailIntegrationAccessContext(
			ctx,
			args.integrationId,
		);
		if (
			!context ||
			context.connectedAccountId !== args.expectedConnectedAccountId ||
			context.workosUpdatedAt !== args.expectedWorkosUpdatedAt
		) {
			return null;
		}
		const connectedAccount = await ctx.db.get(context.connectedAccountId);
		if (!connectedAccount) {
			return null;
		}
		if (
			args.error === "needs_reauthorization" &&
			connectedAccount.connectionStatus !== "connected"
		) {
			return null;
		}
		const connectionStatus =
			args.error === "not_installed" ? "disconnected" : "needs_reauthorization";
		if (connectionStatus !== connectedAccount.connectionStatus) {
			await ctx.db.patch(connectedAccount._id, { connectionStatus });
			await synchronizeResendEmailIntegration(ctx, {
				...connectedAccount,
				connectionStatus,
			});
		}
		return null;
	},
});

export const getWebhookVerificationContext = internalQuery({
	args: {
		integrationId: v.string(),
	},
	returns: v.union(
		v.object({
			acceptsEmail: v.boolean(),
			integrationId: v.id("emailIntegrations"),
			webhookSecret: v.string(),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const integrationId = ctx.db.normalizeId(
			"emailIntegrations",
			args.integrationId,
		);
		if (!integrationId) {
			return null;
		}
		const context = await getEmailIntegrationAccessContext(ctx, integrationId);
		if (!context?.resendWebhook) {
			return null;
		}
		const readiness = deriveEmailReadiness(
			context.connectionStatus,
			context.grantedScopes,
			true,
		);
		return {
			acceptsEmail: readiness.inbound === "ready",
			integrationId: context.integrationId,
			webhookSecret: context.resendWebhook.signingSecret,
		};
	},
});

export const createWebhookCleanupTask = internalMutation({
	args: {
		integrationId: v.id("emailIntegrations"),
		webhookId: v.string(),
	},
	returns: v.id("emailIntegrationWebhookCleanupTasks"),
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("emailIntegrationWebhookCleanupTasks")
			.withIndex("by_integration_id_and_webhook_id", (query) =>
				query
					.eq("integrationId", args.integrationId)
					.eq("webhookId", args.webhookId),
			)
			.unique();
		if (existing) {
			return existing._id;
		}

		const context = await getEmailIntegrationAccessContext(
			ctx,
			args.integrationId,
		);
		if (!context) {
			throw new Error("Email integration not found for webhook cleanup");
		}
		return await ctx.db.insert("emailIntegrationWebhookCleanupTasks", {
			integrationId: context.integrationId,
			webhookId: args.webhookId,
			workosOrganizationId: context.workosOrganizationId,
			workosUserId: context.workosUserId,
			attempts: 0,
			nextAttemptAt: Date.now(),
		});
	},
});

export const getWebhookCleanupContext = internalQuery({
	args: {
		taskId: v.id("emailIntegrationWebhookCleanupTasks"),
	},
	returns: v.union(
		v.object({
			attempts: v.number(),
			taskId: v.id("emailIntegrationWebhookCleanupTasks"),
			webhookId: v.string(),
			workosOrganizationId: v.string(),
			workosUserId: v.string(),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const task = await ctx.db.get(args.taskId);
		if (!task || task.completedAt !== undefined) {
			return null;
		}
		return {
			attempts: task.attempts,
			taskId: task._id,
			webhookId: task.webhookId,
			workosOrganizationId: task.workosOrganizationId,
			workosUserId: task.workosUserId,
		};
	},
});

export const recordWebhookCleanupAttempt = internalMutation({
	args: {
		taskId: v.id("emailIntegrationWebhookCleanupTasks"),
		nextAttemptAt: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const task = await ctx.db.get(args.taskId);
		if (task && task.completedAt === undefined) {
			await ctx.db.patch(task._id, {
				attempts: task.attempts + 1,
				nextAttemptAt: args.nextAttemptAt,
			});
		}
		return null;
	},
});

export const completeWebhookCleanup = internalMutation({
	args: {
		taskId: v.id("emailIntegrationWebhookCleanupTasks"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const task = await ctx.db.get(args.taskId);
		if (task && task.completedAt === undefined) {
			await ctx.db.patch(task._id, { completedAt: Date.now() });
		}
		return null;
	},
});

export const claimDueWebhookCleanupTasks = internalMutation({
	args: {
		now: v.number(),
		leaseUntil: v.number(),
	},
	returns: v.array(v.id("emailIntegrationWebhookCleanupTasks")),
	handler: async (ctx, args) => {
		const tasks = await ctx.db
			.query("emailIntegrationWebhookCleanupTasks")
			.withIndex("by_completed_at_and_next_attempt_at", (query) =>
				query.eq("completedAt", undefined).lte("nextAttemptAt", args.now),
			)
			.take(50);
		await Promise.all(
			tasks.map((task) =>
				ctx.db.patch(task._id, { nextAttemptAt: args.leaseUntil }),
			),
		);
		return tasks.map((task) => task._id);
	},
});

export const getResendConnectionOverview = query({
	args: {},
	returns: v.object({
		connectionStatus: v.union(
			v.literal("not_connected"),
			connectionStatusValidator,
		),
		inboundReadiness: emailReadinessValidator.fields.inbound,
		outboundReadiness: emailReadinessValidator.fields.outbound,
	}),
	handler: async (ctx) => {
		const workspace = await requireActor(ctx);
		const account = await ctx.db
			.query("connectedAccounts")
			.withIndex(
				"by_organization_id_provider_slug_workos_user_id_updated_at",
				(index) =>
					index
						.eq("organizationId", workspace.organization._id)
						.eq("providerSlug", getResendPipesProviderSlug())
						.eq("workosUserId", workspace.identity.subject),
			)
			.order("desc")
			.first();
		if (!account) {
			return {
				connectionStatus: "not_connected" as const,
				inboundReadiness: "connection_inactive" as const,
				outboundReadiness: "connection_inactive" as const,
			};
		}
		const integration = await ctx.db
			.query("emailIntegrations")
			.withIndex("by_connected_account_id", (index) =>
				index.eq("connectedAccountId", account._id),
			)
			.unique();
		const readiness = deriveEmailReadiness(
			account.connectionStatus,
			account.grantedScopes,
			integration?.resendWebhook !== undefined,
		);
		return {
			connectionStatus: account.connectionStatus,
			inboundReadiness: readiness.inbound,
			outboundReadiness: readiness.outbound,
		};
	},
});
