import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { buildEntityFieldValues } from "./entity-form-values.ts";

const ENTITY_TYPE_ID = "entity-type" as Id<"entityTypes">;
const OPTIONAL_FIELD_ID = "optional-boolean" as Id<"entityFieldDefinitions">;
const REQUIRED_FIELD_ID = "required-boolean" as Id<"entityFieldDefinitions">;

function booleanField({
	id,
	required,
}: {
	id: Id<"entityFieldDefinitions">;
	required: boolean;
}): Doc<"entityFieldDefinitions"> {
	return {
		_id: id,
		_creationTime: 1,
		entityTypeId: ENTITY_TYPE_ID,
		label: required ? "Required boolean" : "Optional boolean",
		valueType: "boolean",
		required,
		position: 0,
		archivedAt: null,
	};
}

describe("buildEntityFieldValues boolean mapping", () => {
	it("omits an unset optional boolean", () => {
		const result = buildEntityFieldValues(
			[booleanField({ id: OPTIONAL_FIELD_ID, required: false })],
			{},
			new Map(),
		);

		expect(result).toEqual({ success: true, values: [] });
	});

	it("preserves an explicit false optional boolean", () => {
		const result = buildEntityFieldValues(
			[booleanField({ id: OPTIONAL_FIELD_ID, required: false })],
			{},
			new Map([[OPTIONAL_FIELD_ID, false]]),
		);

		expect(result).toEqual({
			success: true,
			values: [
				{
					kind: "boolean",
					fieldDefinitionId: OPTIONAL_FIELD_ID,
					value: false,
				},
			],
		});
	});

	it("preserves an explicit true optional boolean", () => {
		const result = buildEntityFieldValues(
			[booleanField({ id: OPTIONAL_FIELD_ID, required: false })],
			{},
			new Map([[OPTIONAL_FIELD_ID, true]]),
		);

		expect(result).toEqual({
			success: true,
			values: [
				{
					kind: "boolean",
					fieldDefinitionId: OPTIONAL_FIELD_ID,
					value: true,
				},
			],
		});
	});

	it.each([
		{ state: new Map<Id<"entityFieldDefinitions">, boolean>(), value: false },
		{
			state: new Map<Id<"entityFieldDefinitions">, boolean>([
				[REQUIRED_FIELD_ID, true],
			]),
			value: true,
		},
	])("always emits a required boolean as $value", ({ state, value }) => {
		const result = buildEntityFieldValues(
			[booleanField({ id: REQUIRED_FIELD_ID, required: true })],
			{},
			state,
		);

		expect(result).toEqual({
			success: true,
			values: [
				{
					kind: "boolean",
					fieldDefinitionId: REQUIRED_FIELD_ID,
					value,
				},
			],
		});
	});
});
