import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireActor } from "../auth/access";

export const list = query({
	args: {
		paginationOpts: paginationOptsValidator,
	},
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);

		return await ctx.db
			.query("contacts")
			.withIndex("by_organization_id_and_last_seen_at", (index) =>
				index.eq("organizationId", actor.organization._id),
			)
			.order("desc")
			.paginate(args.paginationOpts);
	},
});

export const get = query({
	args: {
		contactId: v.string(),
	},
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		const contactId = ctx.db.normalizeId("contacts", args.contactId);
		if (!contactId) {
			return null;
		}

		const contact = await ctx.db.get(contactId);
		return contact?.organizationId === actor.organization._id ? contact : null;
	},
});

export const listMessages = query({
	args: {
		contactId: v.id("contacts"),
		paginationOpts: paginationOptsValidator,
	},
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		const contact = await ctx.db.get(args.contactId);
		if (contact?.organizationId !== actor.organization._id) {
			throw new Error("Contact not found");
		}

		const result = await ctx.db
			.query("emailMessages")
			.withIndex("by_sender_contact_id_and_received_at", (index) =>
				index.eq("senderContactId", contact._id),
			)
			.order("desc")
			.paginate(args.paginationOpts);

		const page = await Promise.all(
			result.page.map(async (message) => {
				const connection = await ctx.db.get(message.connectionId);
				if (!connection) {
					throw new Error("Email connection not found");
				}

				return {
					message,
					connection: {
						displayName: connection.displayName,
						address: connection.address,
					},
				};
			}),
		);

		return {
			...result,
			page,
		};
	},
});
