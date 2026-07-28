import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation, internalQuery } from "../_generated/server";

export type ResendPipesSnapshot = {
	connectedAccountId: string;
	dataIntegrationId: string;
	organizationId: string;
	scopes: string[];
	updatedAt: number;
	userId: string;
};

export async function synchronizeResendIntegration(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	event:
		| "pipes.connected_account.connected"
		| "pipes.connected_account.disconnected"
		| "pipes.connected_account.reauthorization_needed",
	snapshot: ResendPipesSnapshot,
) {
	const existing = await ctx.db
		.query("emailIntegrations")
		.withIndex("by_workos_connected_account_id", (query) =>
			query.eq("workosConnectedAccountId", snapshot.connectedAccountId),
		)
		.unique();

	if (existing && existing.organizationId !== organizationId) {
		throw new Error("A connected email account cannot change organization");
	}
	if (
		existing &&
		(existing.workosUserId !== snapshot.userId ||
			existing.workosDataIntegrationId !== snapshot.dataIntegrationId)
	) {
		throw new Error("A connected email account cannot change identity");
	}
	if (
		existing &&
		existing.workosConnectedAccountUpdatedAt >= snapshot.updatedAt
	) {
		return existing._id;
	}

	const hasRequiredAccess =
		event === "pipes.connected_account.connected" &&
		snapshot.scopes.includes("full_access");
	const status =
		event === "pipes.connected_account.disconnected"
			? ("disconnected" as const)
			: hasRequiredAccess
				? ("connected" as const)
				: ("needs_reauthorization" as const);
	const fields = {
		status,
		workosUserId: snapshot.userId,
		workosOrganizationId: snapshot.organizationId,
		workosDataIntegrationId: snapshot.dataIntegrationId,
		workosConnectedAccountUpdatedAt: snapshot.updatedAt,
	};
	const integrationId = existing
		? existing._id
		: await ctx.db.insert("emailIntegrations", {
				organizationId,
				provider: "resend",
				workosConnectedAccountId: snapshot.connectedAccountId,
				...fields,
			});

	if (existing) {
		await ctx.db.patch(existing._id, fields);
	}
	if (status === "connected") {
		await ctx.scheduler.runAfter(
			0,
			internal.email.integrationActions.reconcileResendWebhook,
			{
				integrationId,
				expectedConnectedAccountUpdatedAt: snapshot.updatedAt,
				attempt: 0,
			},
		);
	}
	return integrationId;
}

export const getResendProvisioningContext = internalQuery({
	args: {
		integrationId: v.id("emailIntegrations"),
		expectedConnectedAccountUpdatedAt: v.number(),
	},
	returns: v.union(
		v.object({
			integrationId: v.id("emailIntegrations"),
			webhookId: v.optional(v.string()),
			workosOrganizationId: v.string(),
			workosUserId: v.string(),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const integration = await ctx.db.get(args.integrationId);
		if (
			!integration ||
			integration.provider !== "resend" ||
			integration.status !== "connected" ||
			integration.workosConnectedAccountUpdatedAt !==
				args.expectedConnectedAccountUpdatedAt
		) {
			return null;
		}
		return {
			integrationId: integration._id,
			webhookId:
				integration.webhookSecret !== undefined
					? integration.webhookId
					: undefined,
			workosOrganizationId: integration.workosOrganizationId,
			workosUserId: integration.workosUserId,
		};
	},
});

export const getResendAccessContext = internalQuery({
	args: {
		integrationId: v.id("emailIntegrations"),
	},
	returns: v.union(
		v.object({
			_id: v.id("emailIntegrations"),
			_creationTime: v.number(),
			organizationId: v.id("organizations"),
			provider: v.literal("resend"),
			status: v.union(
				v.literal("connected"),
				v.literal("needs_reauthorization"),
				v.literal("disconnected"),
			),
			workosUserId: v.string(),
			workosOrganizationId: v.string(),
			workosDataIntegrationId: v.string(),
			workosConnectedAccountId: v.string(),
			workosConnectedAccountUpdatedAt: v.number(),
			webhookId: v.optional(v.string()),
			webhookSecret: v.optional(v.string()),
			webhookProvisionedAt: v.optional(v.number()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		return await ctx.db.get(args.integrationId);
	},
});

export const activateResendWebhook = internalMutation({
	args: {
		integrationId: v.id("emailIntegrations"),
		expectedConnectedAccountUpdatedAt: v.number(),
		webhookId: v.string(),
		webhookSecret: v.string(),
	},
	returns: v.boolean(),
	handler: async (ctx, args) => {
		const integration = await ctx.db.get(args.integrationId);
		if (
			!integration ||
			integration.status !== "connected" ||
			integration.workosConnectedAccountUpdatedAt !==
				args.expectedConnectedAccountUpdatedAt ||
			integration.webhookId !== undefined ||
			integration.webhookSecret !== undefined
		) {
			return false;
		}

		await ctx.db.patch(integration._id, {
			webhookId: args.webhookId,
			webhookSecret: args.webhookSecret,
			webhookProvisionedAt: Date.now(),
		});
		return true;
	},
});

export const markNeedsReauthorization = internalMutation({
	args: {
		integrationId: v.id("emailIntegrations"),
		expectedConnectedAccountUpdatedAt: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const integration = await ctx.db.get(args.integrationId);
		if (
			integration?.status === "connected" &&
			integration.workosConnectedAccountUpdatedAt ===
				args.expectedConnectedAccountUpdatedAt
		) {
			await ctx.db.patch(integration._id, {
				status: "needs_reauthorization",
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
		const integration = await ctx.db.get(integrationId);
		if (!integration?.webhookId || !integration.webhookSecret) {
			return null;
		}
		return {
			acceptsEmail: integration.status === "connected",
			integrationId: integration._id,
			webhookSecret: integration.webhookSecret,
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

		const integration = await ctx.db.get(args.integrationId);
		if (!integration) {
			throw new Error("Email integration not found for webhook cleanup");
		}
		return await ctx.db.insert("emailIntegrationWebhookCleanupTasks", {
			integrationId: integration._id,
			webhookId: args.webhookId,
			workosOrganizationId: integration.workosOrganizationId,
			workosUserId: integration.workosUserId,
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
