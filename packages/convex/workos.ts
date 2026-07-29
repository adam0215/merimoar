import { type AuthFunctions, AuthKit } from "@convex-dev/workos-authkit";
import { type GenericMutationCtx } from "convex/server";
import { v } from "convex/values";
import {
	type ResendPipesSnapshot,
	synchronizeResendIntegration,
} from "#/email/integrations";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type {
	MutationCtx as AppMutationCtx,
	QueryCtx,
} from "./_generated/server";
import { internalMutation } from "./_generated/server";

export const PIPES_CONNECTED_ACCOUNT_EVENT_TYPES = [
	"pipes.connected_account.connected",
	"pipes.connected_account.disconnected",
	"pipes.connected_account.reauthorization_needed",
] as const;

export const AUTHKIT_ADDITIONAL_EVENT_TYPES = [
	"organization.created",
	"organization.updated",
	"organization.deleted",
	"organization_membership.created",
	"organization_membership.updated",
	"organization_membership.deleted",
] as const;

const authFunctions: AuthFunctions = internal.workos;

export const authKit = new AuthKit<DataModel>(components.workOSAuthKit, {
	authFunctions,
	apiHostname: process.env.WORKOS_API_HOSTNAME,
	additionalEventTypes: [...AUTHKIT_ADDITIONAL_EVENT_TYPES],
});

type WorkosMutationCtx = GenericMutationCtx<DataModel>;

export async function getWorkosUser(
	ctx: Pick<QueryCtx | AppMutationCtx, "runQuery">,
	workosUserId: string,
) {
	return await ctx.runQuery(components.workOSAuthKit.lib.getAuthUser, {
		id: workosUserId,
	});
}

async function findOrganization(
	ctx: WorkosMutationCtx,
	workosOrganizationId: string,
) {
	return await ctx.db
		.query("organizations")
		.withIndex("by_workos_organization_id", (index) =>
			index.eq("workosOrganizationId", workosOrganizationId),
		)
		.unique();
}

async function upsertOrganization(
	ctx: WorkosMutationCtx,
	workosOrganizationId: string,
	name: string,
) {
	const organization = await findOrganization(ctx, workosOrganizationId);
	if (organization) {
		await ctx.db.patch(organization._id, { name, active: true });
		return organization._id;
	}
	return await ctx.db.insert("organizations", {
		name,
		workosOrganizationId,
		active: true,
	});
}

async function ensureOrganization(
	ctx: WorkosMutationCtx,
	workosOrganizationId: string,
) {
	const organization = await findOrganization(ctx, workosOrganizationId);
	if (organization) {
		return organization._id;
	}
	return await ctx.db.insert("organizations", {
		name: workosOrganizationId,
		workosOrganizationId,
		active: true,
	});
}

async function upsertMembership(
	ctx: WorkosMutationCtx,
	workosOrganizationId: string,
	workosUserId: string,
	active: boolean,
) {
	const organizationId = await ensureOrganization(ctx, workosOrganizationId);
	const membership = await ctx.db
		.query("organizationMembers")
		.withIndex("by_organization_id_and_workos_user_id", (index) =>
			index
				.eq("organizationId", organizationId)
				.eq("workosUserId", workosUserId),
		)
		.unique();
	if (membership) {
		await ctx.db.patch(membership._id, { active });
		return;
	}
	await ctx.db.insert("organizationMembers", {
		organizationId,
		workosUserId,
		active,
	});
}

export const { authKitEvent } = authKit.events({
	"organization.created": async (ctx, event) => {
		await upsertOrganization(ctx, event.data.id, event.data.name);
	},
	"organization.updated": async (ctx, event) => {
		await upsertOrganization(ctx, event.data.id, event.data.name);
	},
	"organization.deleted": async (ctx, event) => {
		const organization = await findOrganization(ctx, event.data.id);
		if (organization) {
			await ctx.db.patch(organization._id, { active: false });
		}
	},
	"organization_membership.created": async (ctx, event) => {
		await upsertMembership(
			ctx,
			event.data.organizationId,
			event.data.userId,
			event.data.status === "active",
		);
	},
	"organization_membership.updated": async (ctx, event) => {
		await upsertMembership(
			ctx,
			event.data.organizationId,
			event.data.userId,
			event.data.status === "active",
		);
	},
	"organization_membership.deleted": async (ctx, event) => {
		const organization = await findOrganization(ctx, event.data.organizationId);
		if (!organization) {
			return;
		}
		const membership = await ctx.db
			.query("organizationMembers")
			.withIndex("by_organization_id_and_workos_user_id", (index) =>
				index
					.eq("organizationId", organization._id)
					.eq("workosUserId", event.data.userId),
			)
			.unique();
		if (membership) {
			await ctx.db.patch(membership._id, { active: false });
		}
	},
});

export function isPipesConnectedAccountEvent(
	event: string,
): event is (typeof PIPES_CONNECTED_ACCOUNT_EVENT_TYPES)[number] {
	return PIPES_CONNECTED_ACCOUNT_EVENT_TYPES.some(
		(eventType) => eventType === event,
	);
}

function parseResendConnectedAccountEventData(
	data: Record<string, unknown>,
): ResendPipesSnapshot | null {
	const updatedAt =
		typeof data.updated_at === "string"
			? Date.parse(data.updated_at)
			: Number.NaN;
	if (
		typeof data.id !== "string" ||
		typeof data.data_integration_id !== "string" ||
		typeof data.organization_id !== "string" ||
		!Array.isArray(data.scopes) ||
		!data.scopes.every((scope) => typeof scope === "string") ||
		!Number.isFinite(updatedAt) ||
		typeof data.user_id !== "string"
	) {
		return null;
	}
	return {
		connectedAccountId: data.id,
		dataIntegrationId: data.data_integration_id,
		organizationId: data.organization_id,
		scopes: data.scopes,
		updatedAt,
		userId: data.user_id,
	};
}

export const processPipesWebhookEvent = internalMutation({
	args: {
		eventId: v.string(),
		event: v.union(
			v.literal("pipes.connected_account.connected"),
			v.literal("pipes.connected_account.disconnected"),
			v.literal("pipes.connected_account.reauthorization_needed"),
		),
		data: v.record(v.string(), v.any()),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		const providerSlug = args.data.provider_slug;
		if (typeof providerSlug !== "string") {
			throw new Error("Invalid WorkOS Pipes provider");
		}
		if (providerSlug !== "resend") {
			return null;
		}
		const processedEvent = await ctx.db
			.query("emailIntegrationSyncEvents")
			.withIndex("by_source_and_source_event_id", (query) =>
				query.eq("source", "workos_pipes").eq("sourceEventId", args.eventId),
			)
			.unique();
		if (processedEvent) {
			return null;
		}
		await ctx.db.insert("emailIntegrationSyncEvents", {
			source: "workos_pipes",
			sourceEventId: args.eventId,
			eventType: args.event,
			processedAt: Date.now(),
		});
		if (args.data.organization_id === null || args.data.user_id === null) {
			return null;
		}
		const data = parseResendConnectedAccountEventData(args.data);
		if (!data) {
			throw new Error("Invalid WorkOS Pipes Resend connected account");
		}
		const organizationId = await ensureOrganization(ctx, data.organizationId);
		await synchronizeResendIntegration(ctx, organizationId, args.event, data);
		return null;
	},
});
