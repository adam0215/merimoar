"use node";

import { NotFoundException } from "@workos-inc/node";
import { v } from "convex/values";
import { getResendPipesProviderSlug } from "#/integrations/resendProvider";
import { createWorkOSClient } from "#/integrations/workosAccess";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

const RECONCILIATION_BATCH_SIZE = 25;

export const reconcileConnectedAccountsWithWorkos = internalAction({
	args: { cursor: v.optional(v.string()) },
	returns: v.null(),
	handler: async (ctx, args) => {
		const workos = createWorkOSClient();
		const resendProviderSlug = getResendPipesProviderSlug();
		let resendDataIntegrationId: string | undefined;
		try {
			resendDataIntegrationId = (
				await workos.pipes.getDataIntegration({ slug: resendProviderSlug })
			).id;
		} catch (error) {
			if (!(error instanceof NotFoundException)) {
				throw error;
			}
		}
		const page = await ctx.runQuery(
			internal.integrations.connectedAccounts.listForWorkosReconciliation,
			{
				paginationOpts: {
					cursor: args.cursor ?? null,
					numItems: RECONCILIATION_BATCH_SIZE,
				},
			},
		);
		for (const account of page.page) {
			if (account.workosDataIntegrationId.startsWith("seed:")) {
				continue;
			}
			const isResendDataIntegration =
				account.workosDataIntegrationId === resendDataIntegrationId;
			if (!isResendDataIntegration && account.providerSlug === "custom") {
				continue;
			}
			try {
				const remote = await workos.pipes.getUserConnectedAccount({
					slug: isResendDataIntegration
						? resendProviderSlug
						: account.providerSlug,
					organizationId: account.workosOrganizationId,
					userId: account.workosUserId,
				});
				const remoteUpdatedAt = Date.parse(remote.updatedAt);
				if (
					remote.id !== account.workosConnectedAccountId ||
					remote.organizationId !== account.workosOrganizationId ||
					remote.userId !== account.workosUserId ||
					!Number.isFinite(remoteUpdatedAt)
				) {
					throw new Error(
						`WorkOS reconciliation identity mismatch for ${account._id}`,
					);
				}
				await ctx.runMutation(
					internal.integrations.connectedAccounts.applyWorkosReconciliation,
					{
						connectedAccountId: account._id,
						expectedWorkosUpdatedAt: account.workosUpdatedAt,
						resendDataIntegrationId,
						connectionStatus: remote.state,
						grantedScopes: remote.scopes,
						workosUpdatedAt: remoteUpdatedAt,
					},
				);
			} catch (error) {
				if (!(error instanceof NotFoundException)) {
					throw error;
				}
				await ctx.runMutation(
					internal.integrations.connectedAccounts.applyWorkosReconciliation,
					{
						connectedAccountId: account._id,
						expectedWorkosUpdatedAt: account.workosUpdatedAt,
						resendDataIntegrationId,
						connectionStatus: "disconnected",
						grantedScopes: [],
						workosUpdatedAt: account.workosUpdatedAt,
					},
				);
			}
		}
		if (!page.isDone) {
			await ctx.scheduler.runAfter(
				0,
				internal.integrations.reconcileActions
					.reconcileConnectedAccountsWithWorkos,
				{ cursor: page.continueCursor },
			);
		}
		return null;
	},
});
