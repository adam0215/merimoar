import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireActor } from "../auth/access";
import {
	MAX_ENTITIES_PER_TYPE,
	MAX_ENTITY_TYPES_PER_ORGANIZATION,
	MAX_FIELDS_PER_ENTITY_TYPE,
} from "./constants";

export const listTypes = query({
	args: {},
	handler: async (ctx) => {
		const workspace = await requireActor(ctx);
		return await ctx.db
			.query("entityTypes")
			.withIndex("by_organization_id_and_archived_at_and_name", (index) =>
				index
					.eq("organizationId", workspace.organization._id)
					.eq("archivedAt", null),
			)
			.take(MAX_ENTITY_TYPES_PER_ORGANIZATION);
	},
});

export const getType = query({
	args: {
		entityTypeId: v.string(),
	},
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		const entityTypeId = ctx.db.normalizeId("entityTypes", args.entityTypeId);
		if (!entityTypeId) {
			return null;
		}

		const entityType = await ctx.db.get(entityTypeId);
		if (
			!entityType ||
			entityType.organizationId !== workspace.organization._id ||
			entityType.archivedAt !== null
		) {
			return null;
		}

		const [fieldDefinitions, entities] = await Promise.all([
			ctx.db
				.query("entityFieldDefinitions")
				.withIndex("by_entity_type_id_and_archived_at_and_position", (index) =>
					index.eq("entityTypeId", entityType._id).eq("archivedAt", null),
				)
				.take(MAX_FIELDS_PER_ENTITY_TYPE),
			ctx.db
				.query("entities")
				.withIndex(
					"by_entity_type_id_and_archived_at_and_display_name",
					(index) =>
						index.eq("entityTypeId", entityType._id).eq("archivedAt", null),
				)
				.take(MAX_ENTITIES_PER_TYPE),
		]);

		return { entityType, fieldDefinitions, entities };
	},
});
