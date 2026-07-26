import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function appendCaseEvent(
	ctx: MutationCtx,
	caseRecord: Doc<"cases">,
	body: string,
	actorMemberId: Id<"organizationMembers">,
	occurredAt = Date.now(),
) {
	const createdAt = Date.now();
	const eventId = await ctx.db.insert("caseEvents", {
		caseId: caseRecord._id,
		body,
		occurredAt,
		createdAt,
		createdByMemberId: actorMemberId,
	});
	await ctx.db.patch("cases", caseRecord._id, {
		lastActivityAt: occurredAt,
		updatedAt: createdAt,
	});
	return eventId;
}
