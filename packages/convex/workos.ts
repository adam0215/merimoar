import { type AuthFunctions, AuthKit } from "@convex-dev/workos-authkit";
import { type GenericMutationCtx } from "convex/server";
import { v } from "convex/values";
import {
	hasResendEmailIntegration,
	synchronizeResendEmailIntegration,
	upsertConnectedAccount,
} from "#/integrations/connectedAccounts";
import type { ConnectedAccountSnapshot } from "#/integrations/model";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type {
	MutationCtx as AppMutationCtx,
	QueryCtx,
} from "./_generated/server";
import { internalMutation } from "./_generated/server";

const DEFAULT_CASE_REFERENCE_SLUG = "CASE";

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

export function getWorkosUserDisplayName(
	user: NonNullable<Awaited<ReturnType<typeof getWorkosUser>>>,
) {
	return (
		user.name?.trim() ||
		[user.firstName, user.lastName].filter(Boolean).join(" ") ||
		user.email
	);
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
		referenceSlug: DEFAULT_CASE_REFERENCE_SLUG,
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
		referenceSlug: DEFAULT_CASE_REFERENCE_SLUG,
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

export function parseConnectedAccountSnapshot(
	event: (typeof PIPES_CONNECTED_ACCOUNT_EVENT_TYPES)[number],
	data: Record<string, unknown>,
): ConnectedAccountSnapshot | null {
	const updatedAt =
		typeof data.updated_at === "string"
			? Date.parse(data.updated_at)
			: Number.NaN;
	if (
		typeof data.id !== "string" ||
		typeof data.data_integration_id !== "string" ||
		typeof data.provider_slug !== "string" ||
		typeof data.organization_id !== "string" ||
		!Array.isArray(data.scopes) ||
		!data.scopes.every((scope) => typeof scope === "string") ||
		!Number.isFinite(updatedAt) ||
		typeof data.user_id !== "string"
	) {
		return null;
	}
	return {
		workosConnectedAccountId: data.id,
		workosDataIntegrationId: data.data_integration_id,
		providerSlug: data.provider_slug,
		workosUserId: data.user_id,
		workosOrganizationId: data.organization_id,
		grantedScopes: data.scopes,
		connectionStatus:
			event === "pipes.connected_account.connected"
				? "connected"
				: event === "pipes.connected_account.disconnected"
					? "disconnected"
					: "needs_reauthorization",
		workosUpdatedAt: updatedAt,
	};
}

export const processConnectedAccountWebhookEvent = internalMutation({
	args: {
		eventId: v.string(),
		event: v.union(
			v.literal("pipes.connected_account.connected"),
			v.literal("pipes.connected_account.disconnected"),
			v.literal("pipes.connected_account.reauthorization_needed"),
		),
		data: v.record(v.string(), v.any()),
		resendDataIntegrationId: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		const processedEvent = await ctx.db
			.query("connectedAccountSyncEvents")
			.withIndex("by_source_and_source_event_id", (query) =>
				query.eq("source", "workos_pipes").eq("sourceEventId", args.eventId),
			)
			.unique();
		if (processedEvent) {
			return null;
		}

		if (args.data.organization_id === null || args.data.user_id === null) {
			const updatedAt =
				typeof args.data.updated_at === "string"
					? Date.parse(args.data.updated_at)
					: Number.NaN;
			await ctx.db.insert("connectedAccountSyncEvents", {
				source: "workos_pipes",
				sourceEventId: args.eventId,
				eventType: args.event,
				providerSlug:
					typeof args.data.provider_slug === "string"
						? args.data.provider_slug
						: undefined,
				workosConnectedAccountId:
					typeof args.data.id === "string" ? args.data.id : undefined,
				workosUpdatedAt: Number.isFinite(updatedAt) ? updatedAt : undefined,
				outcome: "ignored_unscoped",
				processedAt: Date.now(),
			});
			return null;
		}

		const snapshot = parseConnectedAccountSnapshot(args.event, args.data);
		if (!snapshot) {
			throw new Error("Invalid WorkOS Pipes connected account");
		}
		const organizationId = await ensureOrganization(
			ctx,
			snapshot.workosOrganizationId,
		);
		const result = await upsertConnectedAccount(ctx, organizationId, snapshot);
		if (
			(await hasResendEmailIntegration(ctx, result.connectedAccount._id)) ||
			result.connectedAccount.workosDataIntegrationId ===
				args.resendDataIntegrationId
		) {
			await synchronizeResendEmailIntegration(ctx, result.connectedAccount);
		}
		await ctx.db.insert("connectedAccountSyncEvents", {
			source: "workos_pipes",
			sourceEventId: args.eventId,
			eventType: args.event,
			providerSlug: snapshot.providerSlug,
			workosConnectedAccountId: snapshot.workosConnectedAccountId,
			connectedAccountId: result.connectedAccount._id,
			workosUpdatedAt: snapshot.workosUpdatedAt,
			outcome: result.outcome,
			processedAt: Date.now(),
		});
		return null;
	},
});
