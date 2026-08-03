import { ConvexError, v } from "convex/values";
import * as validation from "valibot";
import { requireActor } from "#/auth/access";
import { organizationReferenceSlugSchema } from "#/organization/input";
import { mutation, query } from "../_generated/server";

export const get = query({
	args: {},
	returns: v.object({ referenceSlug: v.string() }),
	handler: async (ctx) => {
		const { organization } = await requireActor(ctx);
		if (organization.referenceSlug === undefined) {
			throw new Error("Organization reference slug has not been migrated");
		}
		return { referenceSlug: organization.referenceSlug };
	},
});

export const updateReferenceSlug = mutation({
	args: { referenceSlug: v.string() },
	returns: v.null(),
	handler: async (ctx, args) => {
		const { organization } = await requireActor(ctx);
		const referenceSlug = validation.safeParse(
			organizationReferenceSlugSchema,
			args.referenceSlug,
		);
		if (!referenceSlug.success) {
			throw new ConvexError({
				code: "INVALID_ORGANIZATION_REFERENCE_SLUG",
				message: referenceSlug.issues[0]?.message ?? "Use 2–4 letters.",
			});
		}
		await ctx.db.patch("organizations", organization._id, {
			referenceSlug: referenceSlug.output,
		});
		return null;
	},
});
