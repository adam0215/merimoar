import * as v from "valibot";
import { ENTITY_FIELD_TYPES, ENTITY_ICON_KEYS } from "./constants";

const nameSchema = v.pipe(
	v.string(),
	v.trim(),
	v.minLength(2, "Use at least 2 characters."),
	v.maxLength(80, "Use no more than 80 characters."),
);

export const entityTypeInputSchema = v.object({
	name: nameSchema,
	pluralName: nameSchema,
	identifierLabel: nameSchema,
	description: v.pipe(
		v.string(),
		v.trim(),
		v.maxLength(320, "Use no more than 320 characters."),
	),
	icon: v.picklist(ENTITY_ICON_KEYS),
});

export const entityFieldInputSchema = v.object({
	label: nameSchema,
	valueType: v.picklist(ENTITY_FIELD_TYPES),
	required: v.boolean(),
});

export const entityInputSchema = v.object({
	identifier: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(1, "Enter an identifier."),
		v.maxLength(120, "Use no more than 120 characters."),
	),
	displayName: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(1, "Enter a display name."),
		v.maxLength(160, "Use no more than 160 characters."),
	),
});
