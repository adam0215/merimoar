import { ConvexError, v } from "convex/values";
import * as validation from "valibot";
import { mutation } from "../_generated/server";
import { requireActor } from "../auth/access";
import { emailInboxDetailsSchema } from "./input";
import { normalizeEmailAddress } from "./normalize";

export const create = mutation({
	args: {
		displayName: v.string(),
		address: v.string(),
	},
	returns: v.id("emailInboxes"),
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		const result = validation.safeParse(emailInboxDetailsSchema, args);
		if (!result.success) {
			throw new ConvexError({
				code: "INVALID_INBOX",
				message: result.issues[0]?.message ?? "Enter valid inbox details.",
			});
		}

		const address = normalizeEmailAddress(result.output.address);
		const existingInbox = await ctx.db
			.query("emailInboxes")
			.withIndex("by_organization_id_and_address", (query) =>
				query
					.eq("organizationId", workspace.organization._id)
					.eq("address", address),
			)
			.unique();

		if (existingInbox) {
			if (existingInbox.status === "disabled") {
				await ctx.db.patch(existingInbox._id, {
					displayName: result.output.displayName,
					status: "active",
				});
				return existingInbox._id;
			}

			throw new ConvexError({
				code: "ADDRESS_ALREADY_USED",
				message: "This organization already has an inbox with that address.",
			});
		}

		return await ctx.db.insert("emailInboxes", {
			organizationId: workspace.organization._id,
			displayName: result.output.displayName,
			address,
			status: "active",
			unreadThreadCount: 0,
		});
	},
});

export const remove = mutation({
	args: {
		inboxId: v.id("emailInboxes"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		const inbox = await ctx.db.get(args.inboxId);
		if (!inbox || inbox.organizationId !== workspace.organization._id) {
			throw new ConvexError({
				code: "EMAIL_INBOX_NOT_FOUND",
				message: "The email inbox could not be found.",
			});
		}

		await ctx.db.patch(inbox._id, { status: "disabled" });
		return null;
	},
});
