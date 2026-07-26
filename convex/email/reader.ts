import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "../_generated/server";

export const getWorkspace = query({
	args: {
		organizationSlug: v.string(),
	},
	handler: async (ctx, args) => {
		const organization = await ctx.db
			.query("organizations")
			.withIndex("by_slug", (query) =>
				query.eq("slug", args.organizationSlug),
			)
			.unique();

		if (!organization) {
			return null;
		}

		const connections = await ctx.db
			.query("emailConnections")
			.withIndex("by_organization_id", (query) =>
				query.eq("organizationId", organization._id),
			)
			.take(50);

		return {
			organization,
			connections,
		};
	},
});

export const listThreads = query({
	args: {
		connectionId: v.id("emailConnections"),
		paginationOpts: paginationOptsValidator,
	},
	handler: async (ctx, args) => {
		const connection = await ctx.db.get(args.connectionId);
		if (!connection) {
			throw new Error("Email connection not found");
		}

		const result = await ctx.db
			.query("emailThreads")
			.withIndex("by_connection_id_and_last_activity_at", (query) =>
				query.eq("connectionId", args.connectionId),
			)
			.order("desc")
			.paginate(args.paginationOpts);

		const page = await Promise.all(
			result.page.map(async (thread) => ({
				thread,
				latestMessage: thread.latestMessageId
					? await ctx.db.get(thread.latestMessageId)
					: null,
			})),
		);

		return {
			...result,
			page,
		};
	},
});

export const getThread = query({
	args: {
		threadId: v.id("emailThreads"),
	},
	handler: async (ctx, args) => {
		const thread = await ctx.db.get(args.threadId);
		if (!thread) {
			return null;
		}

		const [connection, messages] = await Promise.all([
			ctx.db.get(thread.connectionId),
			ctx.db
				.query("emailMessages")
				.withIndex("by_thread_id_and_received_at", (query) =>
					query.eq("threadId", thread._id),
				)
				.order("asc")
				.take(100),
		]);

		if (!connection) {
			return null;
		}

		return {
			thread,
			connection,
			messages,
		};
	},
});
