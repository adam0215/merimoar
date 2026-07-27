import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireActor } from "../auth/access";

export const listConnections = query({
	args: {},
	handler: async (ctx) => {
		const workspace = await requireActor(ctx);
		return await ctx.db
			.query("emailConnections")
			.withIndex("by_organization_id", (query) =>
				query.eq("organizationId", workspace.organization._id),
			)
			.take(50);
	},
});

export const listThreads = query({
	args: {
		paginationOpts: paginationOptsValidator,
	},
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		const result = await ctx.db
			.query("emailThreads")
			.withIndex("by_organization_id_and_last_activity_at", (query) =>
				query.eq("organizationId", workspace.organization._id),
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
		threadId: v.string(),
	},
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		const threadId = ctx.db.normalizeId("emailThreads", args.threadId);
		if (!threadId) {
			return null;
		}
		const thread = await ctx.db.get(threadId);
		if (!thread || thread.organizationId !== workspace.organization._id) {
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
