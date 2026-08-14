import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";

const FIELD_DELETION_BATCH_SIZE = 50;
const RELATION_DELETION_BATCH_SIZE = 500;

export const continueTypeDeletion = internalMutation({
	args: {
		entityTypeId: v.id("entityTypes"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const entity = await ctx.db
			.query("entities")
			.withIndex("by_entity_type_id_and_normalized_identifier", (index) =>
				index.eq("entityTypeId", args.entityTypeId),
			)
			.first();

		if (entity) {
			await deleteEntityAndDependents(ctx, entity._id);
			await scheduleContinuation(ctx, args.entityTypeId);
			return null;
		}

		const fieldDefinitions = await ctx.db
			.query("entityFieldDefinitions")
			.withIndex("by_entity_type_id_and_position", (index) =>
				index.eq("entityTypeId", args.entityTypeId),
			)
			.take(FIELD_DELETION_BATCH_SIZE);

		for (const fieldDefinition of fieldDefinitions) {
			await ctx.db.delete("entityFieldDefinitions", fieldDefinition._id);
		}
		if (fieldDefinitions.length > 0) {
			await scheduleContinuation(ctx, args.entityTypeId);
		}

		return null;
	},
});

async function scheduleContinuation(
	ctx: MutationCtx,
	entityTypeId: Id<"entityTypes">,
) {
	await ctx.scheduler.runAfter(
		0,
		internal.entity.deletion.continueTypeDeletion,
		{ entityTypeId },
	);
}

async function deleteEntityAndDependents(
	ctx: MutationCtx,
	entityId: Id<"entities">,
) {
	const [textValues, numberValues, booleanValues, dateValues, relations] =
		await Promise.all([
			ctx.db
				.query("entityTextFieldValues")
				.withIndex("by_entity_id_and_field_definition_id", (index) =>
					index.eq("entityId", entityId),
				)
				.take(FIELD_DELETION_BATCH_SIZE),
			ctx.db
				.query("entityNumberFieldValues")
				.withIndex("by_entity_id_and_field_definition_id", (index) =>
					index.eq("entityId", entityId),
				)
				.take(FIELD_DELETION_BATCH_SIZE),
			ctx.db
				.query("entityBooleanFieldValues")
				.withIndex("by_entity_id_and_field_definition_id", (index) =>
					index.eq("entityId", entityId),
				)
				.take(FIELD_DELETION_BATCH_SIZE),
			ctx.db
				.query("entityDateFieldValues")
				.withIndex("by_entity_id_and_field_definition_id", (index) =>
					index.eq("entityId", entityId),
				)
				.take(FIELD_DELETION_BATCH_SIZE),
			ctx.db
				.query("caseEntityRelations")
				.withIndex("by_entity_id_and_ended_at", (index) =>
					index.eq("entityId", entityId),
				)
				.take(RELATION_DELETION_BATCH_SIZE + 1),
		]);

	for (const value of [
		...textValues,
		...numberValues,
		...booleanValues,
		...dateValues,
	]) {
		await ctx.db.delete(value._id);
	}
	for (const relation of relations.slice(0, RELATION_DELETION_BATCH_SIZE)) {
		await ctx.db.delete("caseEntityRelations", relation._id);
	}
	if (relations.length > RELATION_DELETION_BATCH_SIZE) return;

	const entity = await ctx.db.get(entityId);
	if (!entity) return;
	if (entity.globalSearchEntryId) {
		await ctx.db.delete("globalSearchEntries", entity.globalSearchEntryId);
	}
	await ctx.db.delete("entities", entity._id);
}
