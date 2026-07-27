import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

const MAX_RECIPIENTS_PER_EVENT = 100;

export async function updateIngestRecipientStatuses(
	ctx: MutationCtx,
	eventId: Id<"emailIngestEvents">,
	status: Doc<"emailIngestEvents">["status"],
) {
	const recipients = await ctx.db
		.query("emailIngestRecipients")
		.withIndex("by_event_id_and_address", (index) =>
			index.eq("eventId", eventId),
		)
		.take(MAX_RECIPIENTS_PER_EVENT);
	await Promise.all(
		recipients.map((recipient) => ctx.db.patch(recipient._id, { status })),
	);
}
