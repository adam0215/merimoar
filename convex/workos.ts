import { type AuthFunctions, AuthKit } from "@convex-dev/workos-authkit";
import type { GenericMutationCtx } from "convex/server";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type {
	MutationCtx as AppMutationCtx,
	QueryCtx,
} from "./_generated/server";

const authFunctions: AuthFunctions = internal.workos;

export const authKit = new AuthKit<DataModel>(components.workOSAuthKit, {
	authFunctions,
	apiHostname: process.env.WORKOS_API_HOSTNAME,
	additionalEventTypes: [
		"organization.created",
		"organization.updated",
		"organization.deleted",
		"organization_membership.created",
		"organization_membership.updated",
		"organization_membership.deleted",
	],
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
