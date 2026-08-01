import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type CaseChangeActor =
	| { kind: "member"; memberId: Id<"organizationMembers"> }
	| { kind: "agent"; taskId: Id<"agentTasks"> };

async function updateCaseActivity(
	ctx: MutationCtx,
	caseRecord: Doc<"cases">,
	occurredAt: number,
	updatedAt: number,
) {
	await ctx.db.patch("cases", caseRecord._id, {
		lastActivityAt: Math.max(caseRecord.lastActivityAt, occurredAt),
		updatedAt,
	});
}

export async function appendHumanNoteCaseEvent(
	ctx: MutationCtx,
	caseRecord: Doc<"cases">,
	body: string,
	actorMemberId: Id<"organizationMembers">,
	occurredAt = Date.now(),
) {
	const createdAt = Date.now();
	const eventId = await ctx.db.insert("caseEvents", {
		caseId: caseRecord._id,
		type: "human_note",
		body,
		occurredAt,
		createdAt,
		createdByMemberId: actorMemberId,
	});
	await updateCaseActivity(ctx, caseRecord, occurredAt, createdAt);
	return eventId;
}

export async function appendAgentChangeCaseEvent(
	ctx: MutationCtx,
	caseRecord: Doc<"cases">,
	body: string,
	agentTaskId: Id<"agentTasks">,
	occurredAt = Date.now(),
) {
	const createdAt = Date.now();
	const eventId = await ctx.db.insert("caseEvents", {
		caseId: caseRecord._id,
		type: "agent_change",
		body,
		agentTaskId,
		occurredAt,
		createdAt,
		createdByMemberId: null,
	});
	await updateCaseActivity(ctx, caseRecord, occurredAt, createdAt);
	return eventId;
}

export async function appendSystemChangeCaseEvent(
	ctx: MutationCtx,
	caseRecord: Doc<"cases">,
	body: string,
	actorMemberId: Id<"organizationMembers">,
	occurredAt = Date.now(),
) {
	const createdAt = Date.now();
	const eventId = await ctx.db.insert("caseEvents", {
		caseId: caseRecord._id,
		type: "system_change",
		body,
		occurredAt,
		createdAt,
		createdByMemberId: actorMemberId,
	});
	await updateCaseActivity(ctx, caseRecord, occurredAt, createdAt);
	return eventId;
}

export async function appendCaseChangeEvent(
	ctx: MutationCtx,
	caseRecord: Doc<"cases">,
	body: string,
	actor: CaseChangeActor,
	occurredAt = Date.now(),
) {
	if (actor.kind === "agent") {
		return await appendAgentChangeCaseEvent(
			ctx,
			caseRecord,
			body,
			actor.taskId,
			occurredAt,
		);
	}
	return await appendSystemChangeCaseEvent(
		ctx,
		caseRecord,
		body,
		actor.memberId,
		occurredAt,
	);
}

export async function appendInboundEmailCaseEvent(
	ctx: MutationCtx,
	caseRecord: Doc<"cases">,
	emailMessageId: Id<"emailMessages">,
	occurredAt: number,
) {
	const existingEvent = await ctx.db
		.query("caseEvents")
		.withIndex("by_case_id_and_email_message_id", (index) =>
			index.eq("caseId", caseRecord._id).eq("emailMessageId", emailMessageId),
		)
		.unique();
	if (existingEvent) {
		return existingEvent._id;
	}

	const createdAt = Date.now();
	const eventId = await ctx.db.insert("caseEvents", {
		caseId: caseRecord._id,
		type: "inbound_email",
		emailMessageId,
		occurredAt,
		createdAt,
		createdByMemberId: null,
	});
	await updateCaseActivity(ctx, caseRecord, occurredAt, createdAt);
	return eventId;
}

export async function appendOutboundEmailCaseEvent(
	ctx: MutationCtx,
	caseRecord: Doc<"cases">,
	emailMessageId: Id<"emailMessages">,
	actorMemberId: Id<"organizationMembers">,
	occurredAt: number,
) {
	const existingEvent = await ctx.db
		.query("caseEvents")
		.withIndex("by_case_id_and_email_message_id", (index) =>
			index.eq("caseId", caseRecord._id).eq("emailMessageId", emailMessageId),
		)
		.unique();
	if (existingEvent) {
		return existingEvent._id;
	}

	const createdAt = Date.now();
	const eventId = await ctx.db.insert("caseEvents", {
		caseId: caseRecord._id,
		type: "outbound_email",
		emailMessageId,
		occurredAt,
		createdAt,
		createdByMemberId: actorMemberId,
	});
	await updateCaseActivity(ctx, caseRecord, occurredAt, createdAt);
	return eventId;
}
