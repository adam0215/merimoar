import { v } from "convex/values";
import { query } from "../_generated/server";
import { getWorkosUser } from "../workos";

const accessStatusValidator = v.union(
	v.literal("active"),
	v.literal("inactive"),
	v.literal("not_provisioned"),
	v.literal("not_synced"),
	v.literal("unauthenticated"),
);

export const currentAccess = query({
	args: {},
	returns: accessStatusValidator,
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return "unauthenticated";
		}
		const workosOrganizationId = identity.org_id;
		if (typeof workosOrganizationId !== "string" || !workosOrganizationId) {
			return "not_provisioned";
		}
		const organization = await ctx.db
			.query("organizations")
			.withIndex("by_workos_organization_id", (index) =>
				index.eq("workosOrganizationId", workosOrganizationId),
			)
			.unique();
		if (!organization || !organization.active) {
			return "not_provisioned";
		}

		const [member, user] = await Promise.all([
			ctx.db
				.query("organizationMembers")
				.withIndex("by_organization_id_and_workos_user_id", (index) =>
					index
						.eq("organizationId", organization._id)
						.eq("workosUserId", identity.subject),
				)
				.unique(),
			getWorkosUser(ctx, identity.subject),
		]);
		if (!member || !user) {
			return "not_synced";
		}
		if (!member.active) {
			return "inactive";
		}
		return "active";
	},
});
