import {
	IconAlertTriangle,
	IconBan,
	IconCircleCheck,
	IconClock,
	IconHandStop,
	IconLoader,
	IconPlayerPause,
} from "@tabler/icons-react";
import type { AgentTaskStatus } from "#/components/agents/agent-types.ts";
import { Badge } from "#/components/ui/badge.tsx";
import { cn } from "#/lib/utils.ts";

const STATUS_DETAILS: Record<
	AgentTaskStatus,
	{
		label: string;
		icon: typeof IconClock;
		badgeVariant: "secondary" | "success" | "destructive";
		className?: string;
	}
> = {
	active: {
		label: "Working",
		icon: IconLoader,
		badgeVariant: "secondary",
		className:
			"text-foreground [&_svg]:animate-spin motion-reduce:[&_svg]:animate-none",
	},
	waiting: {
		label: "Waiting",
		icon: IconClock,
		badgeVariant: "secondary",
		className: "text-muted-foreground",
	},
	waiting_for_approval: {
		label: "Needs approval",
		icon: IconHandStop,
		badgeVariant: "secondary",
		className: "text-amber-700 dark:text-amber-300",
	},
	completed: {
		label: "Completed",
		icon: IconCircleCheck,
		badgeVariant: "success",
	},
	unable_to_continue: {
		label: "Unable to continue",
		icon: IconAlertTriangle,
		badgeVariant: "destructive",
		className: "text-destructive",
	},
	failed: {
		label: "Failed",
		icon: IconPlayerPause,
		badgeVariant: "destructive",
		className: "text-destructive",
	},
	cancelled: {
		label: "Cancelled",
		icon: IconBan,
		badgeVariant: "secondary",
		className: "text-foreground",
	},
};

export const TASK_OVERVIEW_LABELS = {
	active: STATUS_DETAILS.active.label,
	waiting: STATUS_DETAILS.waiting.label,
	approval: STATUS_DETAILS.waiting_for_approval.label,
	finished: "Finished",
	unable: "Needs help",
} as const;

export function getTaskStatusLabel(status: AgentTaskStatus) {
	return STATUS_DETAILS[status].label;
}

export function TaskStatus({ status }: { status: AgentTaskStatus }) {
	const detail = STATUS_DETAILS[status];
	const Icon = detail.icon;

	return (
		<Badge
			variant={detail.badgeVariant}
			className={cn("gap-1 px-1.5", detail.className)}
		>
			<Icon className="size-3.5" />
			<span>{detail.label}</span>
		</Badge>
	);
}
