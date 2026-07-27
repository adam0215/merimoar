import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { query } from "../_generated/server";
import { requireActor } from "../auth/access";
import {
	MAX_ENTITY_TYPES_PER_ORGANIZATION,
	MAX_FIELDS_PER_ENTITY_TYPE,
} from "./constants";

const ENTITY_PREVIEW_LIMIT = 10;

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

		const fieldDefinitions = await ctx.db
			.query("entityFieldDefinitions")
			.withIndex("by_entity_type_id_and_archived_at_and_position", (index) =>
				index.eq("entityTypeId", entityType._id).eq("archivedAt", null),
			)
			.take(MAX_FIELDS_PER_ENTITY_TYPE);

		return { entityType, fieldDefinitions };
	},
});

export const previewType = query({
	args: {
		entityTypeId: v.id("entityTypes"),
	},
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		const entityType = await ctx.db.get(args.entityTypeId);
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
				.take(ENTITY_PREVIEW_LIMIT),
		]);

		const records = await Promise.all(
			entities.map(async (entity) => ({
				entity,
				values: await listPreviewFieldValuesForEntity(ctx, entity._id),
			})),
		);

		return { entityType, fieldDefinitions, records };
	},
});

async function listPreviewFieldValuesForEntity(
	ctx: QueryCtx,
	entityId: Id<"entities">,
) {
	const [textValues, numberValues, booleanValues, dateValues] =
		await Promise.all([
			ctx.db
				.query("entityTextFieldValues")
				.withIndex("by_entity_id_and_field_definition_id", (index) =>
					index.eq("entityId", entityId),
				)
				.take(MAX_FIELDS_PER_ENTITY_TYPE),
			ctx.db
				.query("entityNumberFieldValues")
				.withIndex("by_entity_id_and_field_definition_id", (index) =>
					index.eq("entityId", entityId),
				)
				.take(MAX_FIELDS_PER_ENTITY_TYPE),
			ctx.db
				.query("entityBooleanFieldValues")
				.withIndex("by_entity_id_and_field_definition_id", (index) =>
					index.eq("entityId", entityId),
				)
				.take(MAX_FIELDS_PER_ENTITY_TYPE),
			ctx.db
				.query("entityDateFieldValues")
				.withIndex("by_entity_id_and_field_definition_id", (index) =>
					index.eq("entityId", entityId),
				)
				.take(MAX_FIELDS_PER_ENTITY_TYPE),
		]);

	return [
		...textValues.map((value) => ({ ...value, kind: "text" as const })),
		...numberValues.map((value) => ({ ...value, kind: "number" as const })),
		...booleanValues.map((value) => ({
			...value,
			kind: "boolean" as const,
		})),
		...dateValues.map((value) => ({ ...value, kind: "date" as const })),
	];
}
