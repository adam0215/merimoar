import { v } from "convex/values";
import { ENTITY_FIELD_TYPES, ENTITY_ICON_KEYS } from "./constants";

export const entityIconValidator = v.union(
	...ENTITY_ICON_KEYS.map((icon) => v.literal(icon)),
);

export const entityFieldTypeValidator = v.union(
	...ENTITY_FIELD_TYPES.map((fieldType) => v.literal(fieldType)),
);
