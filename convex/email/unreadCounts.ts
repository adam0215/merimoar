import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

async function changeInboxUnreadThreadCount(
	ctx: MutationCtx,
	inboxId: Id<"emailInboxes">,
	change: -1 | 1,
) {
	const inbox = await ctx.db.get(inboxId);
	if (!inbox) {
		throw new Error("Email inbox not found while updating its unread count.");
	}

	if (inbox.unreadThreadCount === undefined) {
		return;
	}
	const unreadThreadCount = inbox.unreadThreadCount + change;
	if (unreadThreadCount < 0) {
		throw new Error("Email inbox unread count cannot be negative.");
	}
	await ctx.db.patch(inboxId, { unreadThreadCount });
}

export async function countInboxUnreadThreads(
	ctx: Pick<QueryCtx, "db">,
	inboxId: Id<"emailInboxes">,
) {
	const unreadThreads = await ctx.db
		.query("emailThreads")
		.withIndex("by_inbox_id_and_is_unread", (index) =>
			index.eq("inboxId", inboxId).eq("isUnread", true),
		)
		.collect();
	return unreadThreads.length;
}

export async function setThreadUnread(
	ctx: MutationCtx,
	thread: Doc<"emailThreads">,
	isUnread: boolean,
) {
	const wasUnread = thread.isUnread === true;
	if (thread.isUnread === isUnread) {
		return;
	}

	await ctx.db.patch(thread._id, { isUnread });
	if (wasUnread !== isUnread) {
		await changeInboxUnreadThreadCount(ctx, thread.inboxId, isUnread ? 1 : -1);
	}
}
