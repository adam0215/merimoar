import { v } from "convex/values";
import { requireActor } from "#/auth/access";
import { MAX_ENTITY_TYPES_PER_ORGANIZATION } from "#/entity/constants";
import { entityIconValidator } from "#/entity/model";
import { globalSearchTargetValidator } from "#/globalSearch/model";
import { query } from "../_generated/server";

const MAX_GLOBAL_SEARCH_RESULTS = 20;
const MAX_GLOBAL_SEARCH_QUERY_LENGTH = 100;
const RECENT_RELATIONSHIP_CANDIDATES_LIMIT = 5;

const relationshipCandidateValidator = v.object({
	target: globalSearchTargetValidator,
	identifier: v.string(),
	label: v.string(),
	descriptor: v.string(),
	icon: v.union(entityIconValidator, v.null()),
});

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

export const listRecentRelationshipCandidates = query({
	args: {},
	returns: v.array(relationshipCandidateValidator),
	handler: async (ctx) => {
		const actor = await requireActor(ctx);
		const [contacts, cases, entityTypes] = await Promise.all([
			ctx.db
				.query("contacts")
				.withIndex("by_organization_id_and_last_seen_at", (index) =>
					index.eq("organizationId", actor.organization._id),
				)
				.order("desc")
				.take(RECENT_RELATIONSHIP_CANDIDATES_LIMIT),
			ctx.db
				.query("cases")
				.withIndex("by_organization_id_and_last_activity_at", (index) =>
					index.eq("organizationId", actor.organization._id),
				)
				.order("desc")
				.take(RECENT_RELATIONSHIP_CANDIDATES_LIMIT),
			ctx.db
				.query("entityTypes")
				.withIndex("by_organization_id_and_archived_at_and_name", (index) =>
					index
						.eq("organizationId", actor.organization._id)
						.eq("archivedAt", null),
				)
				.take(MAX_ENTITY_TYPES_PER_ORGANIZATION),
		]);
		const entitiesByType = await Promise.all(
			entityTypes.map(async (entityType) => ({
				entityType,
				entities: await ctx.db
					.query("entities")
					.withIndex(
						"by_entity_type_id_and_archived_at_and_updated_at",
						(index) =>
							index.eq("entityTypeId", entityType._id).eq("archivedAt", null),
					)
					.order("desc")
					.take(RECENT_RELATIONSHIP_CANDIDATES_LIMIT),
			})),
		);

		return [
			...contacts.map((contact) => ({
				updatedAt: contact.lastSeenAt,
				candidate: {
					target: { kind: "contact" as const, contactId: contact._id },
					identifier: contact.address,
					label: contact.name ?? contact.address,
					descriptor: "Contact",
					icon: null,
				},
			})),
			...cases.map((caseRecord) => ({
				updatedAt: caseRecord.lastActivityAt,
				candidate: {
					target: { kind: "case" as const, caseId: caseRecord._id },
					identifier: caseRecord.reference,
					label: caseRecord.title,
					descriptor: "Case",
					icon: null,
				},
			})),
			...entitiesByType.flatMap(({ entityType, entities }) =>
				entities.map((entity) => ({
					updatedAt: entity.updatedAt,
					candidate: {
						target: {
							kind: "entity" as const,
							entityId: entity._id,
							entityTypeId: entityType._id,
						},
						identifier: entity.identifier,
						label: entity.displayName,
						descriptor: entityType.name,
						icon: entityType.icon,
					},
				})),
			),
		]
			.sort((left, right) => right.updatedAt - left.updatedAt)
			.slice(0, RECENT_RELATIONSHIP_CANDIDATES_LIMIT)
			.map(({ candidate }) => candidate);
	},
});
