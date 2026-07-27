import { type Infer, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const globalSearchTargetValidator = v.union(
	v.object({
		kind: v.literal("contact"),
		contactId: v.id("contacts"),
	}),
	v.object({
		kind: v.literal("case"),
		caseId: v.id("cases"),
	}),
	v.object({
		kind: v.literal("entity"),
		entityId: v.id("entities"),
		entityTypeId: v.id("entityTypes"),
	}),
);

export type GlobalSearchTarget = Infer<typeof globalSearchTargetValidator>;

type SearchEntryFields = {
	organizationId: Id<"organizations">;
	target: GlobalSearchTarget;
	identifier: string;
	label: string;
	descriptor: string;
};

function buildSearchText(fields: SearchEntryFields) {
	return [fields.identifier, fields.label, fields.descriptor].join(" ");
}

export async function syncGlobalSearchEntry(
	ctx: MutationCtx,
	entryId: Id<"globalSearchEntries"> | undefined,
	fields: SearchEntryFields,
) {
	const entry = {
		...fields,
		searchText: buildSearchText(fields),
	};

	if (entryId) {
		await ctx.db.replace("globalSearchEntries", entryId, entry);
		return entryId;
	}

	return await ctx.db.insert("globalSearchEntries", entry);
}
