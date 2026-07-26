import { ConvexError, v } from "convex/values";
import { z } from "zod";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { mutation } from "../_generated/server";
import { requireActor } from "../auth/access";
import {
	ENTITY_FIELD_TYPES,
	ENTITY_ICON_KEYS,
	MAX_ENTITIES_PER_TYPE,
	MAX_ENTITY_TYPES_PER_ORGANIZATION,
	MAX_FIELDS_PER_ENTITY_TYPE,
	normalizeEntityIdentifier,
	normalizeEntityKey,
} from "./constants";
import {
	entityFieldValueInputValidator,
	insertEntityFieldValues,
	normalizeEntityFieldValues,
} from "./values";

const nameSchema = z.string().trim().min(2).max(80);
const keySchema = z
	.string()
	.trim()
	.min(1)
	.max(80)
	.transform(normalizeEntityKey)
	.pipe(z.string().min(1).max(80));
const createTypeSchema = z.object({
	name: nameSchema,
	pluralName: nameSchema,
	identifierLabel: nameSchema,
	description: z.string().trim().max(320),
	icon: z.enum(ENTITY_ICON_KEYS),
});
const createFieldSchema = z.object({
	label: nameSchema,
	key: keySchema,
	valueType: z.enum(ENTITY_FIELD_TYPES),
	required: z.boolean(),
});
const createEntitySchema = z.object({
	identifier: z.string().trim().min(1).max(120),
	displayName: z.string().trim().min(1).max(160),
});

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
		icon: v.string(),
	},
	returns: v.id("entityTypes"),
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		const input = createTypeSchema.safeParse(args);
		if (!input.success) {
			throw validationError(
				input.error.issues[0]?.message ?? "Enter valid entity type details.",
			);
		}

		const activeTypes = await ctx.db
			.query("entityTypes")
			.withIndex("by_organization_id_and_archived_at_and_name", (index) =>
				index
					.eq("organizationId", actor.organization._id)
					.eq("archivedAt", null),
			)
			.take(MAX_ENTITY_TYPES_PER_ORGANIZATION);
		if (activeTypes.length >= MAX_ENTITY_TYPES_PER_ORGANIZATION) {
			throw validationError(
				`An organization can have at most ${MAX_ENTITY_TYPES_PER_ORGANIZATION} active entity types.`,
			);
		}

		const key = normalizeEntityKey(input.data.name);
		const existing = await ctx.db
			.query("entityTypes")
			.withIndex("by_organization_id_and_key", (index) =>
				index.eq("organizationId", actor.organization._id).eq("key", key),
			)
			.unique();
		if (existing) {
			throw new ConvexError({
				code: "ENTITY_TYPE_ALREADY_EXISTS",
				message: "An entity type with this name already exists.",
			});
		}

		return await ctx.db.insert("entityTypes", {
			organizationId: actor.organization._id,
			key,
			name: input.data.name,
			pluralName: input.data.pluralName,
			identifierLabel: input.data.identifierLabel,
			description: input.data.description,
			icon: input.data.icon,
			archivedAt: null,
		});
	},
});

export const addField = mutation({
	args: {
		entityTypeId: v.id("entityTypes"),
		label: v.string(),
		key: v.string(),
		valueType: v.string(),
		required: v.boolean(),
	},
	returns: v.id("entityFieldDefinitions"),
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		const input = createFieldSchema.safeParse(args);
		if (!input.success) {
			throw validationError(
				input.error.issues[0]?.message ?? "Enter valid field details.",
			);
		}
		await requireEntityType(ctx, actor.organization._id, args.entityTypeId);

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

		const existing = await ctx.db
			.query("entityFieldDefinitions")
			.withIndex("by_entity_type_id_and_key", (index) =>
				index.eq("entityTypeId", args.entityTypeId).eq("key", input.data.key),
			)
			.unique();
		if (existing) {
			throw new ConvexError({
				code: "ENTITY_FIELD_ALREADY_EXISTS",
				message: "A field with this name already exists.",
			});
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
			key: input.data.key,
			label: input.data.label,
			valueType: input.data.valueType,
			required: input.data.required,
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
		const actor = await requireActor(ctx);
		const input = createEntitySchema.safeParse(args);
		if (!input.success) {
			throw validationError(
				input.error.issues[0]?.message ?? "Enter valid entity details.",
			);
		}
		await requireEntityType(ctx, actor.organization._id, args.entityTypeId);

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
			input.data.identifier,
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
			identifier: input.data.identifier,
			normalizedIdentifier,
			displayName: input.data.displayName,
			createdAt: now,
			updatedAt: now,
			archivedAt: null,
		});
		await insertEntityFieldValues(ctx, entityId, values);
		return entityId;
	},
});
