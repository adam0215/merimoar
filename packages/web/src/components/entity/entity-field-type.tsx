import type { EntityFieldType } from "@merimoar/convex/entity/constants";
import {
	IconCalendar,
	IconHash,
	IconLetterT,
	IconToggleRight,
} from "@tabler/icons-react";

export function EntityFieldTypeIcon({
	valueType,
}: {
	valueType: EntityFieldType;
}) {
	const Icon =
		valueType === "number"
			? IconHash
			: valueType === "date"
				? IconCalendar
				: valueType === "boolean"
					? IconToggleRight
					: IconLetterT;

	return <Icon className="size-4" />;
}
