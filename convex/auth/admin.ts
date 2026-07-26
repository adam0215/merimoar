import { ConvexError, v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const linkWorkOSIdentity = internalMutation({
	args: {
		organizationSlug: v.string(),
		workosOrganizationId: v.string(),
		memberEmail: v.string(),
		issuer: v.string(),
		subject: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const organization = await ctx.db
			.query("organizations")
			.withIndex("by_slug", (index) =>
				index.eq("slug", args.organizationSlug.trim()),
			)
			.unique();
		if (!organization) {
			throw new ConvexError({
				code: "ORGANIZATION_NOT_FOUND",
				message: "The organization could not be found.",
			});
		}

		const member = await ctx.db
			.query("organizationMembers")
			.withIndex("by_organization_id_and_email", (index) =>
				index
					.eq("organizationId", organization._id)
					.eq("email", args.memberEmail.trim().toLowerCase()),
			)
			.unique();
		if (!member) {
			throw new ConvexError({
				code: "MEMBER_NOT_FOUND",
				message: "The organization member could not be found.",
			});
		}

		await ctx.db.patch("organizations", organization._id, {
			workosOrganizationId: args.workosOrganizationId.trim(),
		});
		await ctx.db.patch("organizationMembers", member._id, {
			tokenIdentifier: `${args.issuer.trim()}|${args.subject.trim()}`,
		});
		return null;
	},
});
