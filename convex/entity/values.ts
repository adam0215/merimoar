import { ConvexError, type Infer, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const entityFieldValueInputValidator = v.union(
	v.object({
		kind: v.literal("text"),
		fieldDefinitionId: v.id("entityFieldDefinitions"),
		value: v.string(),
	}),
	v.object({
		kind: v.literal("number"),
		fieldDefinitionId: v.id("entityFieldDefinitions"),
		value: v.number(),
	}),
	v.object({
		kind: v.literal("boolean"),
		fieldDefinitionId: v.id("entityFieldDefinitions"),
		value: v.boolean(),
	}),
	v.object({
		kind: v.literal("date"),
		fieldDefinitionId: v.id("entityFieldDefinitions"),
		value: v.number(),
	}),
);

export type EntityFieldValueInput = Infer<
	typeof entityFieldValueInputValidator
>;

function invalidValue(message: string): never {
	throw new ConvexError({
		code: "INVALID_ENTITY_INPUT",
		message,
	});
}

/**
 * Entity values deliberately use one discriminated domain contract over four
 * physical tables. The tables preserve typed validators and typed indexes
 * without JSON or `v.any()`, while this module keeps storage branching out of
 * readers, mutations, and the UI.
 */
export function normalizeEntityFieldValues(
	fields: Doc<"entityFieldDefinitions">[],
	values: EntityFieldValueInput[],
) {
	const fieldById = new Map(fields.map((field) => [field._id, field] as const));
	const providedFieldIds = new Set<Id<"entityFieldDefinitions">>();
	const normalized: EntityFieldValueInput[] = [];

	for (const input of values) {
		const field = fieldById.get(input.fieldDefinitionId);
		if (!field || field.valueType !== input.kind) {
			invalidValue("A field value does not match its definition.");
		}
		if (providedFieldIds.has(input.fieldDefinitionId)) {
			invalidValue("A field can only have one value.");
		}
		providedFieldIds.add(input.fieldDefinitionId);

		if (input.kind === "text") {
			const value = input.value.trim();
			if (!value) {
				if (field.required) {
					invalidValue(`${field.label} is required.`);
				}
				continue;
			}
			normalized.push({ ...input, value });
		} else if (input.kind === "number" || input.kind === "date") {
			if (!Number.isFinite(input.value)) {
				invalidValue(`${field.label} must be a finite number.`);
			}
			normalized.push(input);
		} else {
			normalized.push(input);
		}
	}

	const missingRequiredField = fields.find(
		(field) => field.required && !providedFieldIds.has(field._id),
	);
	if (missingRequiredField) {
		invalidValue(`${missingRequiredField.label} is required.`);
	}

	return normalized;
}

export async function insertEntityFieldValues(
	ctx: MutationCtx,
	entityId: Id<"entities">,
	values: EntityFieldValueInput[],
) {
	for (const input of values) {
		switch (input.kind) {
			case "text":
				await ctx.db.insert("entityTextFieldValues", {
					entityId,
					fieldDefinitionId: input.fieldDefinitionId,
					value: input.value,
				});
				break;
			case "number":
				await ctx.db.insert("entityNumberFieldValues", {
					entityId,
					fieldDefinitionId: input.fieldDefinitionId,
					value: input.value,
				});
				break;
			case "boolean":
				await ctx.db.insert("entityBooleanFieldValues", {
					entityId,
					fieldDefinitionId: input.fieldDefinitionId,
					value: input.value,
				});
				break;
			case "date":
				await ctx.db.insert("entityDateFieldValues", {
					entityId,
					fieldDefinitionId: input.fieldDefinitionId,
					value: input.value,
				});
				break;
		}
	}
}
