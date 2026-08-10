import {
	type BuiltInToolKey,
	builtInToolCatalog,
} from "@merimoar/agent/builtins/catalog";
import { agentManifest } from "@merimoar/agent/manifest";
import { ConvexError, v } from "convex/values";
import {
	requireAgentRuntimeSecret,
	requireClaimedAgentRun,
} from "#/agent/access";
import { requireActor } from "#/auth/access";
import { dispatchDomainEvent } from "#/domainEvents";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";

export const EMAIL_TOOL_KEY = "send_email" satisfies BuiltInToolKey;

type DatabaseContext = Pick<QueryCtx | MutationCtx, "db">;

async function getStoredSetting(
	ctx: DatabaseContext,
	organizationId: Id<"organizations">,
	toolKey: BuiltInToolKey,
) {
	return await ctx.db
		.query("organizationAgentBuiltInTools")
		.withIndex("by_organization_id_and_tool_key", (index) =>
			index.eq("organizationId", organizationId).eq("toolKey", toolKey),
		)
		.unique();
}

export async function isBuiltInToolActive(
	ctx: DatabaseContext,
	organizationId: Id<"organizations">,
	toolKey: BuiltInToolKey,
) {
	const setting = await getStoredSetting(ctx, organizationId, toolKey);
	return setting?.active ?? builtInToolCatalog[toolKey].defaultActive;
}

export async function requireBuiltInToolActive(
	ctx: DatabaseContext,
	organizationId: Id<"organizations">,
	toolKey: BuiltInToolKey,
) {
	if (await isBuiltInToolActive(ctx, organizationId, toolKey)) return;
	throw new ConvexError({
		code: "AGENT_TOOL_DISABLED",
		message: "This agent tool is disabled for this organization.",
	});
}

export const getWorkspaceConfiguration = query({
	args: {},
	returns: v.object({
		emailSendingActive: v.boolean(),
	}),
	handler: async (ctx) => {
		const actor = await requireActor(ctx);
		return {
			emailSendingActive: await isBuiltInToolActive(
				ctx,
				actor.organization._id,
				EMAIL_TOOL_KEY,
			),
		};
	},
});

export const setEmailSendingActive = mutation({
	args: { active: v.boolean() },
	returns: v.null(),
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		const existing = await getStoredSetting(
			ctx,
			actor.organization._id,
			EMAIL_TOOL_KEY,
		);
		const wasActive =
			existing?.active ?? builtInToolCatalog[EMAIL_TOOL_KEY].defaultActive;
		const changedAt = Date.now();
		if (existing) {
			await ctx.db.patch(existing._id, {
				active: args.active,
				updatedAt: changedAt,
				updatedByMemberId: actor.member._id,
			});
		} else {
			await ctx.db.insert("organizationAgentBuiltInTools", {
				organizationId: actor.organization._id,
				toolKey: EMAIL_TOOL_KEY,
				active: args.active,
				updatedAt: changedAt,
				updatedByMemberId: actor.member._id,
			});
		}

		if (wasActive && !args.active) {
			await dispatchDomainEvent(ctx, {
				name: "organization.agentBuiltInToolDisabled",
				payload: {
					organizationId: actor.organization._id,
					toolKey: EMAIL_TOOL_KEY,
					disabledAt: changedAt,
				},
			});
		}
		return null;
	},
});

export const loadActiveForRun = mutation({
	args: {
		runtimeSecret: v.string(),
		runId: v.id("agentRuns"),
		claimToken: v.string(),
	},
	returns: v.array(v.string()),
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		const { task } = await requireClaimedAgentRun(ctx, args);
		const definition =
			agentManifest[task.agentKey as keyof typeof agentManifest];
		if (!definition) {
			throw new Error(`Unsupported agent key: ${task.agentKey}`);
		}
		const active = await Promise.all(
			definition.builtInTools.map(async (toolKey) => ({
				toolKey,
				active: await isBuiltInToolActive(ctx, task.organizationId, toolKey),
			})),
		);
		return active
			.filter((setting) => setting.active)
			.map((setting) => setting.toolKey);
	},
});
