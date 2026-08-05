import { api } from "@merimoar/convex/api";
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { TaskStatus } from "#/components/agents/agent-status.tsx";
import {
	type AgentTaskDetail,
	getRequestedByLabel,
	taskRetainsAgentOwnership,
} from "#/components/agents/agent-types.ts";
import { TakeOverTaskDialog } from "#/components/agents/take-over-task-dialog.tsx";
import { TaskActivity } from "#/components/agents/task-activity.tsx";
import { TaskPromptInput } from "#/components/agents/task-prompt-input.tsx";
import { Button } from "#/components/ui/button.tsx";
import { formatDateTime } from "#/lib/date-format.ts";
import { cn } from "#/lib/utils.ts";

export function AgentTaskInspector({ taskId }: { taskId: string }) {
	const detail = useQuery(api.agent.reader.get, { taskId });

	if (detail === undefined) {
		return (
			<div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
				Loading task…
			</div>
		);
	}

	if (detail === null) {
		return (
			<div className="flex h-full flex-col items-center justify-center p-6 text-center">
				<p className="text-sm font-medium">Task not found</p>
				<Button
					nativeButton={false}
					variant="secondary"
					size="sm"
					className="mt-4"
					render={<Link to="/agents" search={{ view: "tasks" }} />}
				>
					<IconArrowLeft />
					Back to tasks
				</Button>
			</div>
		);
	}
	const persistedTaskId = detail.taskId;

	return (
		<div className="relative flex h-full min-h-0 flex-col">
			<div className="flex h-12 shrink-0 items-center px-3">
				<Button
					nativeButton={false}
					variant="ghost"
					size="sm"
					render={<Link to="/agents" search={{ view: "tasks" }} />}
				>
					<IconArrowLeft />
					Tasks
				</Button>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto w-full max-w-4xl p-6">
					<TaskHeader detail={detail} />
					<section className="mt-10" aria-labelledby="task-activity-heading">
						<h2 id="task-activity-heading" className="font-semibold">
							Activity
						</h2>
						<div className="mt-4">
							<TaskActivity
								taskId={persistedTaskId}
								taskStatus={detail.task.status}
							/>
						</div>
					</section>
				</div>
			</div>
			<div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
				<div className="mx-auto w-full max-w-4xl px-6 pb-6">
					<div className="pointer-events-auto">
						<TaskPromptInput
							taskId={persistedTaskId}
							taskStatus={detail.task.status}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

function TaskHeader({ detail }: { detail: AgentTaskDetail }) {
	const terminalAt =
		"ownershipReleasedAt" in detail.task
			? detail.task.ownershipReleasedAt
			: undefined;
	const outcome = getTaskOutcome(detail.task);
	const hasActions = taskRetainsAgentOwnership(detail.task.status);

	return (
		<header>
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
						{detail.anchorCase.title}
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Requested by{" "}
						{getRequestedByLabel(
							detail.task.requestedBy,
							detail.requestedByMember,
						)}{" "}
						at{" "}
						<time dateTime={new Date(detail.task.requestedAt).toISOString()}>
							{formatDateTime(detail.task.requestedAt)}
						</time>
					</p>
				</div>
				<div className="mt-1 flex shrink-0 items-center gap-2">
					<TaskStatus status={detail.task.status} />
					<time
						dateTime={new Date(
							terminalAt ?? detail.task.requestedAt,
						).toISOString()}
						className="text-xs text-muted-foreground"
					>
						{formatDateTime(terminalAt ?? detail.task.requestedAt)}
					</time>
				</div>
			</div>

			<div className="mt-5 flex items-start gap-6">
				{hasActions && (
					<div className="flex shrink-0 flex-wrap gap-2">
						<TakeOverTaskDialog
							caseId={detail.anchorCase.id}
							label="Stop task"
							variant="secondary"
						/>
					</div>
				)}

				{outcome && (
					<div
						className={cn(
							"min-w-0 max-w-prose text-left",
							hasActions && "ml-auto",
						)}
					>
						<p className="text-xs font-medium text-muted-foreground">
							Latest status
						</p>
						<p className="mt-1 text-sm leading-6 text-muted-foreground">
							{outcome}
						</p>
					</div>
				)}
			</div>

			<Link
				to="/cases"
				search={{ case: detail.anchorCase.id }}
				className="mt-6 flex items-center gap-3 rounded-xl bg-muted px-3 py-3.5 text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-medium">
						{detail.anchorCase.title}
					</p>
					<p className="mt-1 text-xs text-muted-foreground">
						{detail.anchorCase.reference}
					</p>
				</div>
				<IconArrowRight className="size-4 shrink-0 text-muted-foreground" />
			</Link>
		</header>
	);
}

function getTaskOutcome(task: AgentTaskDetail["task"]) {
	switch (task.status) {
		case "waiting":
			return task.waitingReason;
		case "completed":
		case "unable_to_continue":
			return task.result;
		case "failed":
			return task.error;
		case "cancelled":
			return task.reason;
		case "active":
		case "waiting_for_approval":
			return null;
	}
}
