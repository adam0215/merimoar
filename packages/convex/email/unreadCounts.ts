import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

async function changeInboxUnreadThreadCount(
	ctx: MutationCtx,
	inboxId: Id<"emailInboxes">,
	change: -1 | 1,
) {
	const inbox = await ctx.db.get(inboxId);
	if (!inbox) {
		throw new Error("Email inbox not found while updating its unread count.");
	}

	const unreadThreadCount = inbox.unreadThreadCount + change;
	if (unreadThreadCount < 0) {
		throw new Error("Email inbox unread count cannot be negative.");
	}
	await ctx.db.patch(inboxId, { unreadThreadCount });
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
