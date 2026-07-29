import type { api } from "@merimoar/convex/api";
import type { EntityFieldType } from "@merimoar/convex/entity/constants";
import type { FunctionReturnType } from "convex/server";

export type EntityTypeDetail = NonNullable<
	FunctionReturnType<typeof api.entity.reader.getType>
>;

export const ENTITY_FIELD_TYPE_LABELS: Record<EntityFieldType, string> = {
	text: "Text",
	number: "Number",
	boolean: "Yes / no",
	date: "Date",
};
