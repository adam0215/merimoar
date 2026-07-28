import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireActor } from "../auth/access";
import { getActiveCaseRelationForEmailThread } from "../case/emailRelations";
import { updateInboxUnreadThreadCount } from "./unreadCounts";

export const listInboxes = query({
	args: {},
	handler: async (ctx) => {
		const workspace = await requireActor(ctx);
		const inboxes = await ctx.db
			.query("emailInboxes")
			.withIndex("by_organization_id_and_status", (query) =>
				query
					.eq("organizationId", workspace.organization._id)
					.eq("status", "active"),
			)
			.take(100);
		return inboxes.map((inbox) => ({
			_id: inbox._id,
			_creationTime: inbox._creationTime,
			displayName: inbox.displayName,
			address: inbox.address,
			status: "active" as const,
			unreadCount: inbox.unreadThreadCount,
		}));
	},
});

export const listThreads = query({
	args: {
		paginationOpts: paginationOptsValidator,
		inboxId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		let inboxId = args.inboxId
			? ctx.db.normalizeId("emailInboxes", args.inboxId)
			: null;
		if (args.inboxId) {
			const inbox = inboxId ? await ctx.db.get(inboxId) : null;
			if (!inbox || inbox.organizationId !== workspace.organization._id) {
				throw new ConvexError({
					code: "EMAIL_INBOX_NOT_FOUND",
					message: "The email inbox could not be found.",
				});
			}
			inboxId = inbox._id;
		}

		const result = inboxId
			? await ctx.db
					.query("emailThreads")
					.withIndex(
						"by_organization_id_and_inbox_id_and_last_activity_at",
						(query) =>
							query
								.eq("organizationId", workspace.organization._id)
								.eq("inboxId", inboxId),
					)
					.order("desc")
					.paginate(args.paginationOpts)
			: await ctx.db
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

		const [inbox, messages, activeCaseRelation] = await Promise.all([
			ctx.db.get(thread.inboxId),
			ctx.db
				.query("emailMessages")
				.withIndex("by_thread_id_and_received_at", (query) =>
					query.eq("threadId", thread._id),
				)
				.order("asc")
				.take(100),
			getActiveCaseRelationForEmailThread(ctx, thread._id),
		]);

		if (!inbox) {
			return null;
		}
		const activeCase = activeCaseRelation
			? await ctx.db.get(activeCaseRelation.caseId)
			: null;

		return {
			thread,
			inbox,
			messages,
			activeCase:
				activeCaseRelation &&
				activeCase?.organizationId === workspace.organization._id
					? {
							...activeCase,
							relationId: activeCaseRelation._id,
						}
					: null,
		};
	},
});

export const setUnread = mutation({
	args: {
		threadId: v.id("emailThreads"),
		isUnread: v.boolean(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		const thread = await ctx.db.get(args.threadId);
		if (!thread || thread.organizationId !== workspace.organization._id) {
			throw new ConvexError({
				code: "EMAIL_THREAD_NOT_FOUND",
				message: "The email thread could not be found.",
			});
		}

		if (thread.isUnread === args.isUnread) {
			return null;
		}

		await ctx.db.patch(thread._id, { isUnread: args.isUnread });
		await updateInboxUnreadThreadCount(
			ctx,
			thread.inboxId,
			args.isUnread ? 1 : -1,
		);
		return null;
	},
});
