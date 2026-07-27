import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireActor } from "../auth/access";
import { entityIconValidator } from "../entity/model";
import { globalSearchTargetValidator } from "./model";

const MAX_GLOBAL_SEARCH_RESULTS = 20;
const MAX_GLOBAL_SEARCH_QUERY_LENGTH = 100;

export const search = query({
	args: {
		query: v.string(),
	},
	returns: v.array(
		v.object({
			entryId: v.id("globalSearchEntries"),
			target: globalSearchTargetValidator,
			identifier: v.string(),
			label: v.string(),
			descriptor: v.string(),
			icon: v.union(entityIconValidator, v.null()),
		}),
	),
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		const searchQuery = args.query
			.trim()
			.slice(0, MAX_GLOBAL_SEARCH_QUERY_LENGTH);
		if (!searchQuery) {
			return [];
		}

		const entries = await ctx.db
			.query("globalSearchEntries")
			.withSearchIndex("search_search_text_and_organization_id", (index) =>
				index
					.search("searchText", searchQuery)
					.eq("organizationId", actor.organization._id),
			)
			.take(MAX_GLOBAL_SEARCH_RESULTS);

		return await Promise.all(
			entries.map(async (entry) => {
				const entityType =
					entry.target.kind === "entity"
						? await ctx.db.get(entry.target.entityTypeId)
						: null;

				return {
					entryId: entry._id,
					target: entry.target,
					identifier: entry.identifier,
					label: entry.label,
					descriptor: entry.descriptor,
					icon: entityType?.icon ?? null,
				};
			}),
		);
	},
});
