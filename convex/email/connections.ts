import { ConvexError, v } from "convex/values";
import * as validation from "valibot";
import { mutation } from "../_generated/server";
import { requireActor } from "../auth/access";
import { emailConnectionInputSchema } from "./input";
import { normalizeEmailAddress } from "./normalize";

export const create = mutation({
	args: {
		provider: v.literal("resend"),
		displayName: v.string(),
		address: v.string(),
	},
	returns: v.id("emailConnections"),
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		const result = validation.safeParse(emailConnectionInputSchema, args);
		if (!result.success) {
			throw new ConvexError({
				code: "INVALID_CONNECTION",
				message: result.issues[0]?.message ?? "Enter valid connection details.",
			});
		}

		const address = normalizeEmailAddress(result.output.address);
		const existingConnection = await ctx.db
			.query("emailConnections")
			.withIndex("by_address", (query) => query.eq("address", address))
			.unique();

		if (existingConnection) {
			if (
				existingConnection.status === "disabled" &&
				existingConnection.organizationId === actor.organization._id
			) {
				await ctx.db.patch("emailConnections", existingConnection._id, {
					provider: result.output.provider,
					displayName: result.output.displayName,
					status: "active",
				});
				return existingConnection._id;
			}

			throw new ConvexError({
				code: "ADDRESS_ALREADY_CONNECTED",
				message: "This email address is already connected.",
			});
		}

		return await ctx.db.insert("emailConnections", {
			organizationId: actor.organization._id,
			provider: result.output.provider,
			displayName: result.output.displayName,
			address,
			status: "active",
		});
	},
});

export const remove = mutation({
	args: {
		connectionId: v.id("emailConnections"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		const connection = await ctx.db.get(args.connectionId);
		if (!connection || connection.organizationId !== actor.organization._id) {
			throw new ConvexError({
				code: "EMAIL_CONNECTION_NOT_FOUND",
				message: "The email connection could not be found.",
			});
		}

		await ctx.db.patch("emailConnections", connection._id, {
			status: "disabled",
		});
		return null;
	},
});
