import type { Doc, Id } from "@merimoar/convex/data-model";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { EntityIcon } from "#/lib/entity-icons.tsx";

export function EntityTypeSelect({
	entityTypes,
	value,
	onValueChange,
	placeholder = "Choose entity type",
	size = "default",
	className,
	align = "center",
	ariaLabel,
}: {
	entityTypes: Doc<"entityTypes">[];
	value?: Id<"entityTypes">;
	onValueChange: (entityTypeId: Id<"entityTypes">) => void;
	placeholder?: string;
	size?: "sm" | "default";
	className?: string;
	align?: "start" | "center" | "end";
	ariaLabel?: string;
}) {
	const items = entityTypes.map((entityType) => ({
		value: entityType._id,
		label: (
			<>
				<EntityIcon icon={entityType.icon} />
				{entityType.pluralName}
			</>
		),
	}));

	return (
		<Select
			items={items}
			value={value}
			disabled={entityTypes.length === 0}
			onValueChange={(entityTypeId) => {
				const entityType = entityTypes.find(
					(candidate) => candidate._id === entityTypeId,
				);
				if (entityType) {
					onValueChange(entityType._id);
				}
			}}
		>
			<SelectTrigger size={size} className={className} aria-label={ariaLabel}>
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent align={align}>
				{entityTypes.map((entityType) => (
					<SelectItem key={entityType._id} value={entityType._id}>
						<EntityIcon icon={entityType.icon} />
						{entityType.pluralName}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
