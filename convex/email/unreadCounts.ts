import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function updateInboxUnreadThreadCount(
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
