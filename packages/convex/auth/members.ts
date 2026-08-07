import { v } from "convex/values";
import { resolveActorAccess } from "#/auth/access";
import { query } from "../_generated/server";

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
		const access = await resolveActorAccess(ctx);
		return access.status === "organization_required" ||
			access.status === "organization_not_provisioned"
			? "not_provisioned"
			: access.status;
	},
});
