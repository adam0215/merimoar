import { parseDateInput } from "#/lib/date-input.ts";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { EntityFieldValueInput } from "../../../convex/entity/values";

export function buildEntityFieldValues(
	fieldDefinitions: Doc<"entityFieldDefinitions">[],
	textValues: Record<string, string>,
	booleanValues: ReadonlyMap<Id<"entityFieldDefinitions">, boolean>,
):
	| { success: true; values: EntityFieldValueInput[] }
	| { success: false; message: string } {
	const values: EntityFieldValueInput[] = [];

	for (const field of fieldDefinitions) {
		if (field.valueType === "boolean") {
			const booleanValue = booleanValues.get(field._id);
			if (booleanValue === undefined && !field.required) {
				continue;
			}
			values.push({
				kind: "boolean",
				fieldDefinitionId: field._id,
				value: booleanValue ?? false,
			});
			continue;
		}

		const value = textValues[field._id]?.trim() ?? "";
		if (!value) {
			if (field.required) {
				return { success: false, message: `${field.label} is required.` };
			}
			continue;
		}

		if (field.valueType === "text") {
			values.push({
				kind: "text",
				fieldDefinitionId: field._id,
				value,
			});
			continue;
		}

		const numericValue =
			field.valueType === "number" ? Number(value) : parseDateInput(value);
		if (!Number.isFinite(numericValue)) {
			return {
				success: false,
				message:
					field.valueType === "number"
						? `${field.label} must be a number.`
						: `${field.label} must be a valid date.`,
			};
		}

		if (field.valueType === "number") {
			values.push({
				kind: "number",
				fieldDefinitionId: field._id,
				value: numericValue,
			});
		} else {
			values.push({
				kind: "date",
				fieldDefinitionId: field._id,
				value: numericValue,
			});
		}
	}

	return { success: true, values };
}
