import { defaultAgentDefinition } from "@merimoar/agent/manifest";
import { api } from "@merimoar/convex/api";
import {
	IconAlertTriangle,
	IconCircleCheck,
	IconClock,
	IconHandStop,
	IconPlayerPlay,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useState } from "react";
import {
	TASK_OVERVIEW_LABELS,
	TaskStatus,
} from "#/components/agents/agent-status.tsx";
import {
	type AgentTaskStatus,
	type AgentTaskSummary,
	getTaskProgress,
	taskIsTerminal,
	taskRetainsAgentOwnership,
} from "#/components/agents/agent-types.ts";
import { TakeOverTaskDialog } from "#/components/agents/take-over-task-dialog.tsx";
import { OverviewMetric } from "#/components/overview-metric.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { formatDateTime } from "#/lib/date-format.ts";
import { cn } from "#/lib/utils.ts";

type TaskFilter = "current" | "attention" | "finished" | "all";

const TASK_FILTERS: { value: TaskFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "current", label: "Currently working" },
	{ value: "attention", label: "Needs attention" },
	{ value: "finished", label: "Finished" },
];

function taskMatchesFilter(status: AgentTaskStatus, filter: TaskFilter) {
	if (filter === "current") return status === "active";
	if (filter === "attention") {
		return (
			status === "waiting_for_approval" ||
			status === "unable_to_continue" ||
			status === "failed"
		);
	}
	if (filter === "finished") return taskIsTerminal(status);
	return true;
}

export function AgentOverview() {
	const tasks = useQuery(api.agent.reader.listWorkspaceTasks, {});
	const currentTasks =
		tasks?.filter((task) => taskRetainsAgentOwnership(task.task.status)) ?? [];
	const counts = getTaskCounts(tasks ?? []);

	return (
		<AgentWorkspacePage title="Overview">
			<section aria-labelledby="task-overview-heading">
				<h2 id="task-overview-heading" className="font-semibold">
					At a glance
				</h2>
				<div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
					<OverviewMetric
						label={TASK_OVERVIEW_LABELS.active}
						value={counts.active}
						icon={<IconPlayerPlay />}
					/>
					<OverviewMetric
						label={TASK_OVERVIEW_LABELS.waiting}
						value={counts.waiting}
						icon={<IconClock />}
					/>
					<OverviewMetric
						label={TASK_OVERVIEW_LABELS.approval}
						value={counts.approval}
						icon={<IconHandStop />}
					/>
					<OverviewMetric
						label={TASK_OVERVIEW_LABELS.finished}
						value={counts.finished}
						icon={<IconCircleCheck />}
					/>
					<OverviewMetric
						label={TASK_OVERVIEW_LABELS.unable}
						value={counts.unable}
						icon={<IconAlertTriangle />}
						className="col-span-2 sm:col-span-1"
					/>
				</div>
			</section>

			<section aria-labelledby="current-tasks-heading">
				<div className="flex items-center justify-between gap-3">
					<h2 id="current-tasks-heading" className="font-semibold">
						Current tasks
					</h2>
					<Link
						to="/agents"
						search={{ view: "tasks" }}
						className="text-sm font-medium text-muted-foreground no-underline hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						View all
					</Link>
				</div>
				<TaskList
					tasks={currentTasks}
					loading={tasks === undefined}
					emptyText="No current tasks"
					className="mt-3"
				/>
			</section>
		</AgentWorkspacePage>
	);
}

export function AgentTasks() {
	const [filter, setFilter] = useState<TaskFilter>("all");
	const tasks = useQuery(api.agent.reader.listWorkspaceTasks, {});
	const visibleTasks =
		tasks
			?.filter((task) => taskMatchesFilter(task.task.status, filter))
			.sort(compareWorkspaceTasks) ?? [];

	return (
		<AgentWorkspacePage title="Tasks">
			<section aria-label="Tasks">
				<div className="flex justify-end">
					<Select
						items={TASK_FILTERS}
						value={filter}
						onValueChange={(value) => {
							if (value) setFilter(value);
						}}
					>
						<SelectTrigger size="sm" className="min-w-40">
							<SelectValue />
						</SelectTrigger>
						<SelectContent align="end">
							{TASK_FILTERS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<TaskList
					tasks={visibleTasks}
					loading={tasks === undefined}
					emptyText="No tasks in this view"
					className="mt-3"
				/>
			</section>
		</AgentWorkspacePage>
	);
}

export function AgentToolsPage() {
	return (
		<AgentWorkspacePage title="Tools">
			<AgentTools />
		</AgentWorkspacePage>
	);
}

function AgentTools() {
	return (
		<section aria-labelledby="agent-tools-heading">
			<h2 id="agent-tools-heading" className="sr-only">
				Tools
			</h2>
			<div className="grid gap-2 sm:grid-cols-2">
				{defaultAgentDefinition.tools.map((tool) => (
					<article key={tool} className="rounded-xl border p-4">
						<p className="text-sm font-medium">{formatToolName(tool)}</p>
						<p className="mt-1 font-mono text-xs text-muted-foreground">
							{tool}
						</p>
					</article>
				))}
			</div>
		</section>
	);
}

function AgentWorkspacePage({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="h-full overflow-y-auto">
			<div className="w-full space-y-8 p-6">
				<h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
				{children}
			</div>
		</div>
	);
}

function getTaskCounts(tasks: AgentTaskSummary[]) {
	return {
		active: tasks.filter((task) => task.task.status === "active").length,
		waiting: tasks.filter((task) => task.task.status === "waiting").length,
		approval: tasks.filter(
			(task) => task.task.status === "waiting_for_approval",
		).length,
		finished: tasks.filter(
			(task) =>
				task.task.status === "completed" || task.task.status === "cancelled",
		).length,
		unable: tasks.filter(
			(task) =>
				task.task.status === "unable_to_continue" ||
				task.task.status === "failed",
		).length,
	};
}

function TaskList({
	tasks,
	loading,
	emptyText,
	className,
}: {
	tasks: AgentTaskSummary[];
	loading: boolean;
	emptyText: string;
	className?: string;
}) {
	if (loading || tasks.length === 0) {
		return (
			<div className={cn(className, "px-4 py-12 text-center")}>
				<p className="text-sm text-muted-foreground">
					{loading ? "Loading tasks…" : emptyText}
				</p>
			</div>
		);
	}

	return (
		<div className={cn(className, "space-y-1")}>
			{tasks.map((task) => (
				<TaskRow key={task.taskId} task={task} />
			))}
		</div>
	);
}

function TaskRow({ task }: { task: AgentTaskSummary }) {
	const canStop = taskRetainsAgentOwnership(task.task.status);

	return (
		<article className="relative rounded-xl px-3 py-3.5 transition-colors hover:bg-muted focus-within:bg-muted">
			<Link
				to="/agents"
				search={{ view: "tasks", task: task.taskId }}
				className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
				aria-label={`Open task: ${task.anchorCase.title}`}
			/>
			<div className="pointer-events-none relative min-w-0">
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-center gap-2">
						<p
							className={cn(
								"min-w-0 flex-1 truncate text-sm font-medium",
								task.task.status === "active" && "shimmer",
							)}
						>
							{task.anchorCase.title}
						</p>
						<div className="ml-auto flex shrink-0 items-center gap-2">
							<TaskStatus status={task.task.status} />
							<time
								dateTime={new Date(task.updatedAt).toISOString()}
								className="text-xs text-muted-foreground"
							>
								Updated {formatDateTime(task.updatedAt)}
							</time>
						</div>
						{canStop && (
							<div className="pointer-events-auto relative z-10 shrink-0">
								<TakeOverTaskDialog
									caseId={task.anchorCase.id}
									label={`Stop task: ${task.anchorCase.title}`}
									iconOnly
								/>
							</div>
						)}
					</div>
					<p className="mt-1 truncate text-xs text-muted-foreground">
						{task.anchorCase.reference}
					</p>
					<p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
						{getTaskProgress(task)}
					</p>
				</div>
			</div>
		</article>
	);
}

function compareWorkspaceTasks(
	left: AgentTaskSummary,
	right: AgentTaskSummary,
) {
	const leftIsWorking = left.task.status === "active";
	const rightIsWorking = right.task.status === "active";
	if (leftIsWorking !== rightIsWorking) return leftIsWorking ? -1 : 1;
	return right.task.requestedAt - left.task.requestedAt;
}

function formatToolName(tool: string) {
	return tool
		.split("_")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}
