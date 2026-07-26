import type { Doc } from "../../../convex/_generated/dataModel";
import type { EntityFieldType } from "../../../convex/entity/constants";

export type EntityTypeDetail = {
	entityType: Doc<"entityTypes">;
	fieldDefinitions: Doc<"entityFieldDefinitions">[];
	entities: Doc<"entities">[];
};

export const ENTITY_FIELD_TYPE_LABELS: Record<EntityFieldType, string> = {
	text: "Text",
	number: "Number",
	boolean: "Yes / no",
	date: "Date",
};
