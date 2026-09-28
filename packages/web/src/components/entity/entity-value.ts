import type { EntityFieldValueInput } from "@merimoar/convex/entity/values";

export function formatEntityFieldValue(
	value: EntityFieldValueInput | undefined,
) {
	if (!value) {
		return undefined;
	}
	if (value.kind === "boolean") {
		return value.value ? "Yes" : "No";
	}
	if (value.kind === "number") {
		return value.value.toLocaleString();
	}
	if (value.kind === "date") {
		return new Intl.DateTimeFormat(undefined, {
			year: "numeric",
			month: "long",
			day: "numeric",
		}).format(new Date(value.value));
	}
	return value.value;
}
