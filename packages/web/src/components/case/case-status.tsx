import {
	CASE_STATUS_LABELS,
	CASE_STATUSES,
	CASE_VIEW_FILTERS,
	type CaseStatus,
	type CaseView,
	type CaseViewFilter,
} from "@merimoar/convex/case/model";
import {
	IconClockExclamation,
	IconFolderOpen,
	IconFolders,
	IconUserCheck,
	IconUserQuestion,
} from "@tabler/icons-react";
import { cn } from "#/lib/utils.ts";

export const CASE_STATUS_OPTIONS = CASE_STATUSES.map((status) => ({
	value: status,
	label: CASE_STATUS_LABELS[status],
}));

const CASE_VIEW_LABELS: Record<CaseView, string> = {
	all: "All cases",
	assigned_to_me: "Assigned to me",
	unassigned: "Unassigned",
	all_open: "All open",
	overdue: "Overdue",
	needs_attention: CASE_STATUS_LABELS.needs_attention,
	waiting: CASE_STATUS_LABELS.waiting,
	closed: CASE_STATUS_LABELS.closed,
};

export const CASE_VIEW_FILTER_OPTIONS = CASE_VIEW_FILTERS.map((view) => ({
	value: view,
	label: CASE_VIEW_LABELS[view],
}));

export const CASE_VIEW_OPTIONS = [
	{ value: "all" as const, label: CASE_VIEW_LABELS.all },
	...CASE_VIEW_FILTER_OPTIONS,
];

const STATUS_DOT_CLASS_NAMES: Record<CaseStatus, string> = {
	needs_attention: "bg-destructive",
	waiting: "bg-amber-500",
	clear: "bg-emerald-500",
	open: "bg-blue-500",
	closed: "bg-muted-foreground/40",
};

export function isCaseViewFilter(value: unknown): value is CaseViewFilter {
	return CASE_VIEW_FILTERS.some((view) => view === value);
}

export function CaseViewIndicator({ view }: { view: CaseView }) {
	switch (view) {
		case "all":
			return <IconFolders className="size-4 text-muted-foreground" />;
		case "assigned_to_me":
			return <IconUserCheck className="size-4 text-muted-foreground" />;
		case "unassigned":
			return <IconUserQuestion className="size-4 text-muted-foreground" />;
		case "all_open":
			return <IconFolderOpen className="size-4 text-muted-foreground" />;
		case "overdue":
			return <IconClockExclamation className="size-4 text-muted-foreground" />;
		case "needs_attention":
		case "waiting":
		case "closed":
			return <CaseStatusDot status={view} />;
	}
}

export type { CaseView, CaseViewFilter };

export function CaseStatusDot({
	status,
	className,
}: {
	status: CaseStatus;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"size-2 shrink-0 rounded-full",
				STATUS_DOT_CLASS_NAMES[status],
				className,
			)}
		/>
	);
}
