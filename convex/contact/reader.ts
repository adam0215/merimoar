import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import { query } from "../_generated/server";

async function findOrganizationBySlug(
	ctx: QueryCtx,
	organizationSlug: string,
) {
	return await ctx.db
		.query("organizations")
		.withIndex("by_slug", (index) => index.eq("slug", organizationSlug))
		.unique();
}

export const list = query({
	args: {
		organizationSlug: v.string(),
		paginationOpts: paginationOptsValidator,
	},
	handler: async (ctx, args) => {
		const organization = await findOrganizationBySlug(
			ctx,
			args.organizationSlug,
		);
		if (!organization) {
			throw new Error("Organization not found");
		}

		return await ctx.db
			.query("contacts")
			.withIndex("by_organization_id_and_last_seen_at", (index) =>
				index.eq("organizationId", organization._id),
			)
			.order("desc")
			.paginate(args.paginationOpts);
	},
});

export const get = query({
	args: {
		organizationSlug: v.string(),
		contactId: v.string(),
	},
	handler: async (ctx, args) => {
		const organization = await findOrganizationBySlug(
			ctx,
			args.organizationSlug,
		);
		const contactId = ctx.db.normalizeId("contacts", args.contactId);
		if (!organization || !contactId) {
			return null;
		}

		const contact = await ctx.db.get(contactId);
		return contact?.organizationId === organization._id ? contact : null;
	},
});

export const listMessages = query({
	args: {
		organizationSlug: v.string(),
		contactId: v.id("contacts"),
		paginationOpts: paginationOptsValidator,
	},
	handler: async (ctx, args) => {
		const [organization, contact] = await Promise.all([
			findOrganizationBySlug(ctx, args.organizationSlug),
			ctx.db.get(args.contactId),
		]);
		if (!organization || contact?.organizationId !== organization._id) {
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
				const thread = await ctx.db.get(message.threadId);
				const connection = thread
					? await ctx.db.get(thread.connectionId)
					: null;
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
