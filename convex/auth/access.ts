import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getWorkosUser } from "../workos";

type AuthenticatedContext = Pick<
	QueryCtx | MutationCtx,
	"auth" | "db" | "runQuery"
>;

export async function requireOrganization(ctx: AuthenticatedContext) {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new ConvexError({
			code: "UNAUTHENTICATED",
			message: "Sign in to continue.",
		});
	}

	const workosOrganizationId = identity.org_id;
	if (typeof workosOrganizationId !== "string" || !workosOrganizationId) {
		throw new ConvexError({
			code: "ORGANIZATION_REQUIRED",
			message: "Choose a WorkOS organization to continue.",
		});
	}

	const organization = await ctx.db
		.query("organizations")
		.withIndex("by_workos_organization_id", (index) =>
			index.eq("workosOrganizationId", workosOrganizationId),
		)
		.unique();
	if (!organization || !organization.active) {
		throw new ConvexError({
			code: "ORGANIZATION_NOT_PROVISIONED",
			message: "This WorkOS organization is not provisioned.",
		});
	}

	return { identity, organization };
}

export async function requireActor(ctx: AuthenticatedContext) {
	const workspace = await requireOrganization(ctx);
	const [member, user] = await Promise.all([
		ctx.db
			.query("organizationMembers")
			.withIndex("by_organization_id_and_workos_user_id", (index) =>
				index
					.eq("organizationId", workspace.organization._id)
					.eq("workosUserId", workspace.identity.subject),
			)
			.unique(),
		getWorkosUser(ctx, workspace.identity.subject),
	]);
	if (!member || !member.active || !user) {
		throw new ConvexError({
			code: "MEMBERSHIP_REQUIRED",
			message: "An active WorkOS organization membership is required.",
		});
	}

	return { ...workspace, member, user };
}
