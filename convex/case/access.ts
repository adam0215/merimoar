import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DatabaseContext = Pick<QueryCtx | MutationCtx, "db">;

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
		owner.status !== "active"
	) {
		throw new ConvexError({
			code: "INVALID_CASE_OWNER",
			message: "Choose an active member of this organization.",
		});
	}
}
