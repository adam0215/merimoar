import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

const CASE_REFERENCE_INDEX_WIDTH = 5;

export async function generateNextCaseReference(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
) {
	const organization = await ctx.db.get("organizations", organizationId);
	if (!organization?.referenceSlug) {
		throw new Error("Organization reference slug is not configured");
	}

	const sequence = await ctx.db
		.query("caseReferenceSequences")
		.withIndex("by_organization_id", (index) =>
			index.eq("organizationId", organizationId),
		)
		.unique();
	const nextIndex = sequence ? sequence.lastIndex + 1n : 1n;

	if (sequence) {
		await ctx.db.patch("caseReferenceSequences", sequence._id, {
			lastIndex: nextIndex,
		});
	} else {
		await ctx.db.insert("caseReferenceSequences", {
			organizationId,
			lastIndex: nextIndex,
		});
	}

	return `${organization.referenceSlug}-${String(nextIndex).padStart(CASE_REFERENCE_INDEX_WIDTH, "0")}`;
}
