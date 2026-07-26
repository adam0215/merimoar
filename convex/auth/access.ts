import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type AuthenticatedContext = Pick<QueryCtx | MutationCtx, "auth" | "db">;

export async function requireActor(ctx: AuthenticatedContext) {
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
	if (!organization) {
		throw new ConvexError({
			code: "ORGANIZATION_NOT_PROVISIONED",
			message: "This WorkOS organization is not provisioned.",
		});
	}

	const member = await ctx.db
		.query("organizationMembers")
		.withIndex("by_organization_id_and_token_identifier", (index) =>
			index
				.eq("organizationId", organization._id)
				.eq("tokenIdentifier", identity.tokenIdentifier),
		)
		.unique();
	if (!member || member.status !== "active") {
		throw new ConvexError({
			code: "MEMBER_NOT_AUTHORIZED",
			message: "You are not an active member of this organization.",
		});
	}

	return { identity, member, organization };
}
