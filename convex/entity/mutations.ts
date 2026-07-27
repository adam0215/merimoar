import { ConvexError, v } from "convex/values";
import * as validation from "valibot";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { mutation } from "../_generated/server";
import { requireActor } from "../auth/access";
import {
	MAX_ENTITIES_PER_TYPE,
	MAX_ENTITY_TYPES_PER_ORGANIZATION,
	MAX_FIELDS_PER_ENTITY_TYPE,
	normalizeEntityIdentifier,
	normalizeEntityKey,
} from "./constants";
import {
	entityFieldInputSchema,
	entityInputSchema,
	entityTypeInputSchema,
} from "./input";
import { entityFieldTypeValidator, entityIconValidator } from "./model";
import {
	entityFieldValueInputValidator,
	insertEntityFieldValues,
	normalizeEntityFieldValues,
} from "./values";

function validationError(message: string) {
	return new ConvexError({ code: "INVALID_ENTITY_INPUT", message });
}

async function requireEntityType(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	entityTypeId: Id<"entityTypes">,
) {
	const entityType = await ctx.db.get(entityTypeId);
	if (
		!entityType ||
		entityType.organizationId !== organizationId ||
		entityType.archivedAt !== null
	) {
		throw new ConvexError({
			code: "ENTITY_TYPE_NOT_FOUND",
			message: "The entity type could not be found.",
		});
	}
	return entityType;
}

export const createType = mutation({
	args: {
		name: v.string(),
		pluralName: v.string(),
		identifierLabel: v.string(),
		description: v.string(),
		icon: entityIconValidator,
	},
	returns: v.id("entityTypes"),
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		const input = validation.safeParse(entityTypeInputSchema, args);
		if (!input.success) {
			throw validationError(
				input.issues[0]?.message ?? "Enter valid entity type details.",
			);
		}

		const activeTypes = await ctx.db
			.query("entityTypes")
			.withIndex("by_organization_id_and_archived_at_and_name", (index) =>
				index
					.eq("organizationId", workspace.organization._id)
					.eq("archivedAt", null),
			)
			.take(MAX_ENTITY_TYPES_PER_ORGANIZATION);
		if (activeTypes.length >= MAX_ENTITY_TYPES_PER_ORGANIZATION) {
			throw validationError(
				`An organization can have at most ${MAX_ENTITY_TYPES_PER_ORGANIZATION} active entity types.`,
			);
		}

		const key = normalizeEntityKey(input.output.name);
		const existing = await ctx.db
			.query("entityTypes")
			.withIndex("by_organization_id_and_key", (index) =>
				index.eq("organizationId", workspace.organization._id).eq("key", key),
			)
			.unique();
		if (existing) {
			throw new ConvexError({
				code: "ENTITY_TYPE_ALREADY_EXISTS",
				message: "An entity type with this name already exists.",
			});
		}

		return await ctx.db.insert("entityTypes", {
			organizationId: workspace.organization._id,
			key,
			name: input.output.name,
			pluralName: input.output.pluralName,
			identifierLabel: input.output.identifierLabel,
			description: input.output.description,
			icon: input.output.icon,
			archivedAt: null,
		});
	},
});

export const addField = mutation({
	args: {
		entityTypeId: v.id("entityTypes"),
		label: v.string(),
		valueType: entityFieldTypeValidator,
		required: v.boolean(),
	},
	returns: v.id("entityFieldDefinitions"),
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		const input = validation.safeParse(entityFieldInputSchema, args);
		if (!input.success) {
			throw validationError(
				input.issues[0]?.message ?? "Enter valid field details.",
			);
		}
		await requireEntityType(ctx, workspace.organization._id, args.entityTypeId);

		const activeFields = await ctx.db
			.query("entityFieldDefinitions")
			.withIndex("by_entity_type_id_and_archived_at_and_position", (index) =>
				index.eq("entityTypeId", args.entityTypeId).eq("archivedAt", null),
			)
			.take(MAX_FIELDS_PER_ENTITY_TYPE);
		if (activeFields.length >= MAX_FIELDS_PER_ENTITY_TYPE) {
			throw validationError(
				`An entity type can have at most ${MAX_FIELDS_PER_ENTITY_TYPE} active metadata fields.`,
			);
		}

		const lastField = await ctx.db
			.query("entityFieldDefinitions")
			.withIndex("by_entity_type_id_and_position", (index) =>
				index.eq("entityTypeId", args.entityTypeId),
			)
			.order("desc")
			.first();

		return await ctx.db.insert("entityFieldDefinitions", {
			entityTypeId: args.entityTypeId,
			label: input.output.label,
			valueType: input.output.valueType,
			required: input.output.required,
			position: (lastField?.position ?? -1) + 1,
			archivedAt: null,
		});
	},
});

export const createEntity = mutation({
	args: {
		entityTypeId: v.id("entityTypes"),
		identifier: v.string(),
		displayName: v.string(),
		values: v.array(entityFieldValueInputValidator),
	},
	returns: v.id("entities"),
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		const input = validation.safeParse(entityInputSchema, args);
		if (!input.success) {
			throw validationError(
				input.issues[0]?.message ?? "Enter valid entity details.",
			);
		}
		await requireEntityType(ctx, workspace.organization._id, args.entityTypeId);

		const activeEntities = await ctx.db
			.query("entities")
			.withIndex(
				"by_entity_type_id_and_archived_at_and_display_name",
				(index) =>
					index.eq("entityTypeId", args.entityTypeId).eq("archivedAt", null),
			)
			.take(MAX_ENTITIES_PER_TYPE);
		if (activeEntities.length >= MAX_ENTITIES_PER_TYPE) {
			throw validationError(
				`An entity type can have at most ${MAX_ENTITIES_PER_TYPE} active records.`,
			);
		}

		const normalizedIdentifier = normalizeEntityIdentifier(
			input.output.identifier,
		);
		const existing = await ctx.db
			.query("entities")
			.withIndex("by_entity_type_id_and_normalized_identifier", (index) =>
				index
					.eq("entityTypeId", args.entityTypeId)
					.eq("normalizedIdentifier", normalizedIdentifier),
			)
			.unique();
		if (existing) {
			throw new ConvexError({
				code: "ENTITY_ALREADY_EXISTS",
				message: "An entity with this identifier already exists.",
			});
		}

		const fields = await ctx.db
			.query("entityFieldDefinitions")
			.withIndex("by_entity_type_id_and_archived_at_and_position", (index) =>
				index.eq("entityTypeId", args.entityTypeId).eq("archivedAt", null),
			)
			.take(MAX_FIELDS_PER_ENTITY_TYPE + 1);
		if (fields.length > MAX_FIELDS_PER_ENTITY_TYPE) {
			throw new Error("Entity type exceeds the supported field limit.");
		}
		const values = normalizeEntityFieldValues(fields, args.values);

		const now = Date.now();
		const entityId = await ctx.db.insert("entities", {
			entityTypeId: args.entityTypeId,
			identifier: input.output.identifier,
			normalizedIdentifier,
			displayName: input.output.displayName,
			createdAt: now,
			updatedAt: now,
			archivedAt: null,
		});
		await insertEntityFieldValues(ctx, entityId, values);
		return entityId;
	},
});
