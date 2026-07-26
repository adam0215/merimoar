import { ConvexError, v } from "convex/values";
import { z } from "zod";
import { mutation } from "../_generated/server";
import { normalizeEmailAddress } from "./normalize";

const connectionInputSchema = z.object({
	organizationSlug: z.string().trim().min(1).max(80),
	provider: z.literal("resend"),
	displayName: z.string().trim().min(2).max(80),
	address: z
		.string()
		.trim()
		.toLowerCase()
		.pipe(z.email("Enter a valid email address.")),
});

export const create = mutation({
	args: {
		organizationSlug: v.string(),
		provider: v.literal("resend"),
		displayName: v.string(),
		address: v.string(),
	},
	returns: v.id("emailConnections"),
	handler: async (ctx, args) => {
		const result = connectionInputSchema.safeParse(args);
		if (!result.success) {
			throw new ConvexError({
				code: "INVALID_CONNECTION",
				message:
					result.error.issues[0]?.message ??
					"Enter valid connection details.",
			});
		}

		const organization = await ctx.db
			.query("organizations")
			.withIndex("by_slug", (query) =>
				query.eq("slug", result.data.organizationSlug),
			)
			.unique();

		if (!organization) {
			throw new ConvexError({
				code: "ORGANIZATION_NOT_FOUND",
				message: "The organization could not be found.",
			});
		}

		const address = normalizeEmailAddress(result.data.address);
		const existingConnection = await ctx.db
			.query("emailConnections")
			.withIndex("by_address", (query) => query.eq("address", address))
			.unique();

		if (existingConnection) {
			throw new ConvexError({
				code: "ADDRESS_ALREADY_CONNECTED",
				message: "This email address is already connected.",
			});
		}

		return await ctx.db.insert("emailConnections", {
			organizationId: organization._id,
			provider: result.data.provider,
			displayName: result.data.displayName,
			address,
			status: "active",
		});
	},
});
