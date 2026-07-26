import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import type { EntityFieldType } from "../../../convex/entity/constants";

export type EntityTypeDetail = NonNullable<
	FunctionReturnType<typeof api.entity.reader.getType>
>;

export const ENTITY_FIELD_TYPE_LABELS: Record<EntityFieldType, string> = {
	text: "Text",
	number: "Number",
	boolean: "Yes / no",
	date: "Date",
};
