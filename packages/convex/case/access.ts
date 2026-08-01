import { ConvexError } from "convex/values";
import { getActiveAgentTaskForCase } from "#/case/agentOwnership";
import { getActiveCaseRelationForEmailThread } from "#/case/emailRelations";
import { getWorkosUser } from "#/workos";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DatabaseContext = Pick<QueryCtx | MutationCtx, "db" | "runQuery">;

export async function requireCase(
	ctx: DatabaseContext,
	organizationId: Id<"organizations">,
	caseId: Id<"cases">,
) {
	const caseRecord = await ctx.db.get(caseId);
	if (!caseRecord || caseRecord.organizationId !== organizationId) {
		throw new ConvexError({
			code: "CASE_NOT_FOUND",
			message: "The case could not be found.",
		});
	}
	return caseRecord;
}

export async function requireHumanCaseWriteAccess(
	ctx: DatabaseContext,
	caseId: Id<"cases">,
) {
	const owner = await getActiveAgentTaskForCase(ctx, caseId);
	if (owner) {
		throw new ConvexError({
			code: "CASE_OWNED_BY_AGENT",
			message: "Agent is working on this case. Take it over before editing.",
		});
	}
}

export async function requireHumanEmailThreadWriteAccess(
	ctx: DatabaseContext,
	organizationId: Id<"organizations">,
	threadId: Id<"emailThreads">,
) {
	const relation = await getActiveCaseRelationForEmailThread(ctx, threadId);
	if (!relation) return;
	const caseRecord = await ctx.db.get(relation.caseId);
	if (!caseRecord || caseRecord.organizationId !== organizationId) {
		throw new ConvexError({
			code: "INVALID_EMAIL_CASE_RELATION",
			message: "The email thread has an invalid case relation.",
		});
	}
	await requireHumanCaseWriteAccess(ctx, caseRecord._id);
}

export async function requireAgentTaskCaseWriteAccess(
	ctx: DatabaseContext,
	caseId: Id<"cases">,
	taskId: Id<"agentTasks">,
) {
	const owner = await getActiveAgentTaskForCase(ctx, caseId);
	if (owner?._id !== taskId) {
		throw new ConvexError({
			code: "AGENT_CASE_OWNERSHIP_REQUIRED",
			message: "This agent task does not own the case it tried to change.",
		});
	}
}

export async function validateCaseOwner(
	ctx: DatabaseContext,
	organizationId: Id<"organizations">,
	ownerMemberId: Id<"organizationMembers"> | null,
) {
	if (!ownerMemberId) {
		return;
	}
	const owner = await ctx.db.get(ownerMemberId);
	if (
		!owner ||
		owner.organizationId !== organizationId ||
		!owner.active ||
		!(await getWorkosUser(ctx, owner.workosUserId))
	) {
		throw new ConvexError({
			code: "INVALID_CASE_OWNER",
			message: "Choose an active member of this organization.",
		});
	}
}
