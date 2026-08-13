import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internalMutation, internalQuery } from "../_generated/server";
import {
	type ConnectedAccountSnapshot,
	deriveEmailReadiness,
	type EmailIntegrationAccessContext,
} from "./model";

const STATUS_PRECEDENCE = {
	connected: 0,
	needs_reauthorization: 1,
	disconnected: 2,
} as const;

export type ConnectedAccountUpsertResult = {
	connectedAccount: Doc<"connectedAccounts">;
	outcome: "inserted" | "updated" | "stale" | "unchanged";
};

export async function upsertConnectedAccount(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	snapshot: Omit<ConnectedAccountSnapshot, "workosOrganizationId">,
): Promise<ConnectedAccountUpsertResult> {
	const existing = await ctx.db
		.query("connectedAccounts")
		.withIndex("by_workos_connected_account_id", (query) =>
			query.eq("workosConnectedAccountId", snapshot.workosConnectedAccountId),
		)
		.unique();

	if (existing && existing.organizationId !== organizationId) {
		throw new Error("A connected account cannot change organization");
	}
	if (
		existing &&
		(existing.workosUserId !== snapshot.workosUserId ||
			existing.workosDataIntegrationId !== snapshot.workosDataIntegrationId)
	) {
		throw new Error("A connected account cannot change external identity");
	}

	const incomingScopes = [...new Set(snapshot.grantedScopes)].sort();
	if (!existing) {
		const connectedAccountId = await ctx.db.insert("connectedAccounts", {
			organizationId,
			providerSlug: snapshot.providerSlug,
			workosUserId: snapshot.workosUserId,
			workosDataIntegrationId: snapshot.workosDataIntegrationId,
			workosConnectedAccountId: snapshot.workosConnectedAccountId,
			connectionStatus: snapshot.connectionStatus,
			grantedScopes: incomingScopes,
			workosUpdatedAt: snapshot.workosUpdatedAt,
		});
		const connectedAccount = await ctx.db.get(connectedAccountId);
		if (!connectedAccount) {
			throw new Error("Connected account insert was not visible");
		}
		return { connectedAccount, outcome: "inserted" };
	}

	if (snapshot.workosUpdatedAt < existing.workosUpdatedAt) {
		return { connectedAccount: existing, outcome: "stale" };
	}

	let connectionStatus = snapshot.connectionStatus;
	let grantedScopes = incomingScopes;
	if (snapshot.workosUpdatedAt === existing.workosUpdatedAt) {
		connectionStatus =
			STATUS_PRECEDENCE[existing.connectionStatus] >=
			STATUS_PRECEDENCE[snapshot.connectionStatus]
				? existing.connectionStatus
				: snapshot.connectionStatus;
		// Equal-version deliveries can arrive in either order. Intersecting scopes
		// prevents the later delivery from accidentally widening effective access.
		const existingScopes = new Set(existing.grantedScopes);
		grantedScopes = incomingScopes.filter((scope) => existingScopes.has(scope));
	}

	if (
		existing.connectionStatus === connectionStatus &&
		existing.workosUpdatedAt === snapshot.workosUpdatedAt &&
		existing.grantedScopes.length === grantedScopes.length &&
		existing.grantedScopes.every(
			(scope, index) => scope === grantedScopes[index],
		)
	) {
		return { connectedAccount: existing, outcome: "unchanged" };
	}

	await ctx.db.patch(existing._id, {
		connectionStatus,
		grantedScopes,
		workosUpdatedAt: snapshot.workosUpdatedAt,
	});
	return {
		connectedAccount: {
			...existing,
			connectionStatus,
			grantedScopes,
			workosUpdatedAt: snapshot.workosUpdatedAt,
		},
		outcome: "updated",
	};
}

async function createWebhookCleanupTask(
	ctx: MutationCtx,
	integrationId: Id<"emailIntegrations">,
	connectedAccount: Doc<"connectedAccounts">,
	webhookId: string,
) {
	const existing = await ctx.db
		.query("emailIntegrationWebhookCleanupTasks")
		.withIndex("by_integration_id_and_webhook_id", (query) =>
			query.eq("integrationId", integrationId).eq("webhookId", webhookId),
		)
		.unique();
	if (existing) {
		return existing._id;
	}
	const organization = await ctx.db.get(connectedAccount.organizationId);
	if (!organization) {
		throw new Error("Connected account organization is missing");
	}
	return await ctx.db.insert("emailIntegrationWebhookCleanupTasks", {
		integrationId,
		webhookId,
		workosOrganizationId: organization.workosOrganizationId,
		workosUserId: connectedAccount.workosUserId,
		attempts: 0,
		nextAttemptAt: Date.now(),
	});
}

async function rebindInactiveResendInboxRoutes(
	ctx: MutationCtx,
	connectedAccount: Doc<"connectedAccounts">,
	replacementIntegrationId: Id<"emailIntegrations">,
) {
	if (
		connectedAccount.connectionStatus !== "connected" ||
		!connectedAccount.grantedScopes.includes("full_access")
	) {
		return;
	}

	const inboxes = await ctx.db
		.query("emailInboxes")
		.withIndex("by_organization_id", (query) =>
			query.eq("organizationId", connectedAccount.organizationId),
		)
		.collect();

	for (const inbox of inboxes) {
		const outbound = inbox.outbound;
		if (!outbound || outbound.integrationId === replacementIntegrationId) {
			continue;
		}

		const previousIntegration = await ctx.db.get(outbound.integrationId);
		const previousAccount = previousIntegration
			? await ctx.db.get(previousIntegration.connectedAccountId)
			: null;
		if (
			!previousAccount ||
			previousAccount.connectionStatus === "connected" ||
			previousAccount.organizationId !== connectedAccount.organizationId ||
			previousAccount.workosUserId !== connectedAccount.workosUserId ||
			previousAccount.workosDataIntegrationId !==
				connectedAccount.workosDataIntegrationId
		) {
			continue;
		}

		await ctx.db.patch(inbox._id, {
			outbound: {
				...outbound,
				integrationId: replacementIntegrationId,
			},
		});
	}
}

export async function synchronizeResendEmailIntegration(
	ctx: MutationCtx,
	connectedAccount: Doc<"connectedAccounts">,
) {
	const existing = await ctx.db
		.query("emailIntegrations")
		.withIndex("by_connected_account_id", (query) =>
			query.eq("connectedAccountId", connectedAccount._id),
		)
		.unique();
	const integrationId = existing
		? existing._id
		: await ctx.db.insert("emailIntegrations", {
				connectedAccountId: connectedAccount._id,
			});

	await rebindInactiveResendInboxRoutes(ctx, connectedAccount, integrationId);

	if (
		connectedAccount.connectionStatus !== "connected" &&
		existing?.resendWebhook
	) {
		const taskId = await createWebhookCleanupTask(
			ctx,
			integrationId,
			connectedAccount,
			existing.resendWebhook.webhookId,
		);
		await ctx.db.patch(integrationId, { resendWebhook: undefined });
		await ctx.scheduler.runAfter(
			0,
			internal.email.integrationActions.retryWebhookCleanup,
			{ taskId },
		);
	}

	const readiness = deriveEmailReadiness(
		connectedAccount.connectionStatus,
		connectedAccount.grantedScopes,
		existing?.resendWebhook !== undefined,
	);
	if (readiness.inbound === "ready" || readiness.inbound === "provisioning") {
		await ctx.scheduler.runAfter(
			0,
			internal.email.integrationActions.reconcileResendWebhook,
			{
				integrationId,
				expectedConnectedAccountId: connectedAccount._id,
				expectedWorkosUpdatedAt: connectedAccount.workosUpdatedAt,
				attempt: 0,
			},
		);
	}
	return integrationId;
}

export async function hasResendEmailIntegration(
	ctx: Pick<QueryCtx | MutationCtx, "db">,
	connectedAccountId: Id<"connectedAccounts">,
) {
	return (
		(await ctx.db
			.query("emailIntegrations")
			.withIndex("by_connected_account_id", (query) =>
				query.eq("connectedAccountId", connectedAccountId),
			)
			.unique()) !== null
	);
}

export async function getEmailIntegrationAccessContext(
	ctx: QueryCtx | MutationCtx,
	integrationId: Id<"emailIntegrations">,
): Promise<EmailIntegrationAccessContext | null> {
	const integration = await ctx.db.get(integrationId);
	if (!integration) {
		return null;
	}
	const connectedAccount = await ctx.db.get(integration.connectedAccountId);
	if (!connectedAccount) {
		return null;
	}
	const organization = await ctx.db.get(connectedAccount.organizationId);
	if (!organization) {
		return null;
	}
	return {
		integrationId: integration._id,
		connectedAccountId: connectedAccount._id,
		organizationId: connectedAccount.organizationId,
		providerSlug: connectedAccount.providerSlug,
		connectionStatus: connectedAccount.connectionStatus,
		grantedScopes: connectedAccount.grantedScopes,
		workosUpdatedAt: connectedAccount.workosUpdatedAt,
		workosUserId: connectedAccount.workosUserId,
		workosOrganizationId: organization.workosOrganizationId,
		resendWebhook: integration.resendWebhook,
	};
}

export const listForWorkosReconciliation = internalQuery({
	args: { paginationOpts: paginationOptsValidator },
	handler: async (ctx, args) => {
		const result = await ctx.db
			.query("connectedAccounts")
			.paginate(args.paginationOpts);
		return {
			...result,
			page: await Promise.all(
				result.page.map(async (account) => {
					const organization = await ctx.db.get(account.organizationId);
					if (!organization) {
						throw new Error(
							`Connected account ${account._id} has no organization`,
						);
					}
					return {
						...account,
						workosOrganizationId: organization.workosOrganizationId,
					};
				}),
			),
		};
	},
});

export const applyWorkosReconciliation = internalMutation({
	args: {
		connectedAccountId: v.id("connectedAccounts"),
		expectedWorkosUpdatedAt: v.number(),
		resendDataIntegrationId: v.optional(v.string()),
		connectionStatus: v.union(
			v.literal("connected"),
			v.literal("needs_reauthorization"),
			v.literal("disconnected"),
		),
		grantedScopes: v.array(v.string()),
		workosUpdatedAt: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const account = await ctx.db.get(args.connectedAccountId);
		if (!account || account.workosUpdatedAt !== args.expectedWorkosUpdatedAt) {
			return null;
		}
		const result = await upsertConnectedAccount(ctx, account.organizationId, {
			workosConnectedAccountId: account.workosConnectedAccountId,
			workosDataIntegrationId: account.workosDataIntegrationId,
			providerSlug: account.providerSlug,
			workosUserId: account.workosUserId,
			grantedScopes: args.grantedScopes,
			connectionStatus: args.connectionStatus,
			workosUpdatedAt: args.workosUpdatedAt,
		});
		if (
			(await hasResendEmailIntegration(ctx, result.connectedAccount._id)) ||
			result.connectedAccount.workosDataIntegrationId ===
				args.resendDataIntegrationId
		) {
			await synchronizeResendEmailIntegration(ctx, result.connectedAccount);
		}
		return null;
	},
});
