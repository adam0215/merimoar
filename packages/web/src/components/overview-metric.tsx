import { borderedSurfaceClassName } from "#/components/ui/field-surface.ts";
import { cn } from "#/lib/utils.ts";

export function OverviewMetric({
	label,
	value,
	icon,
	className,
}: {
	label: string;
	value: React.ReactNode;
	icon: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("rounded-2xl p-4", borderedSurfaceClassName, className)}>
			<p className="flex items-center gap-2 text-xs text-muted-foreground">
				<span className="[&>svg]:size-3.5">{icon}</span>
				{label}
			</p>
			<p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
		</div>
	);
}
