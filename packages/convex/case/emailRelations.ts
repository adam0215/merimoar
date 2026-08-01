import { ConvexError } from "convex/values";
import {
	appendCaseChangeEvent,
	appendSystemChangeCaseEvent,
	type CaseChangeActor,
} from "#/case/events";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const MAX_EMAIL_THREADS_PER_CASE = 100;

type DatabaseContext = Pick<MutationCtx | QueryCtx, "db">;

export async function getActiveCaseRelationForEmailThread(
	ctx: DatabaseContext,
	threadId: Id<"emailThreads">,
) {
	return await ctx.db
		.query("caseEmailThreadRelations")
		.withIndex("by_thread_id_and_ended_at", (index) =>
			index.eq("threadId", threadId).eq("endedAt", null),
		)
		.unique();
}

export async function listActiveEmailThreadRelationsForCase(
	ctx: DatabaseContext,
	caseId: Id<"cases">,
) {
	return await ctx.db
		.query("caseEmailThreadRelations")
		.withIndex("by_case_id_and_ended_at", (index) =>
			index.eq("caseId", caseId).eq("endedAt", null),
		)
		.order("desc")
		.take(MAX_EMAIL_THREADS_PER_CASE);
}

export async function linkEmailThreadToCase(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	caseRecord: Doc<"cases">,
	threadId: Id<"emailThreads">,
	actor: CaseChangeActor,
) {
	const thread = await ctx.db.get(threadId);
	if (!thread || thread.organizationId !== organizationId) {
		throw new ConvexError({
			code: "EMAIL_THREAD_NOT_FOUND",
			message: "The email thread could not be found.",
		});
	}

	const activeRelation = await getActiveCaseRelationForEmailThread(
		ctx,
		thread._id,
	);
	if (activeRelation?.caseId === caseRecord._id) {
		return activeRelation._id;
	}

	const previousCase = activeRelation
		? await ctx.db.get(activeRelation.caseId)
		: null;
	if (
		activeRelation &&
		(!previousCase || previousCase.organizationId !== organizationId)
	) {
		throw new ConvexError({
			code: "INVALID_EMAIL_CASE_RELATION",
			message: "The email thread has an invalid case relation.",
		});
	}

	const now = Date.now();
	if (activeRelation && previousCase) {
		await ctx.db.patch("caseEmailThreadRelations", activeRelation._id, {
			endedAt: now,
			unlinkedByMemberId: actor.kind === "member" ? actor.memberId : null,
		});
		await appendCaseChangeEvent(
			ctx,
			previousCase,
			`Email thread moved to ${caseRecord.reference}: ${caseRecord.title}.`,
			actor,
			now,
		);
	}

	const relationId = await ctx.db.insert("caseEmailThreadRelations", {
		caseId: caseRecord._id,
		threadId: thread._id,
		startedAt: now,
		endedAt: null,
		linkedByMemberId: actor.kind === "member" ? actor.memberId : null,
		unlinkedByMemberId: null,
	});
	await appendCaseChangeEvent(
		ctx,
		caseRecord,
		previousCase
			? `Email thread moved from ${previousCase.reference}: ${previousCase.title}.`
			: "Email thread linked.",
		actor,
		now,
	);
	return relationId;
}

export async function unlinkEmailThreadFromCase(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	relationId: Id<"caseEmailThreadRelations">,
	actorMemberId: Id<"organizationMembers">,
) {
	const relation = await ctx.db.get(relationId);
	if (!relation) {
		return;
	}

	const [caseRecord, thread] = await Promise.all([
		ctx.db.get(relation.caseId),
		ctx.db.get(relation.threadId),
	]);
	if (
		!caseRecord ||
		caseRecord.organizationId !== organizationId ||
		!thread ||
		thread.organizationId !== organizationId
	) {
		throw new ConvexError({
			code: "EMAIL_CASE_RELATION_NOT_FOUND",
			message: "The email thread relation could not be found.",
		});
	}
	if (relation.endedAt !== null) {
		return;
	}

	const now = Date.now();
	await ctx.db.patch("caseEmailThreadRelations", relation._id, {
		endedAt: now,
		unlinkedByMemberId: actorMemberId,
	});
	await appendSystemChangeCaseEvent(
		ctx,
		caseRecord,
		"Email thread unlinked.",
		actorMemberId,
		now,
	);
}
