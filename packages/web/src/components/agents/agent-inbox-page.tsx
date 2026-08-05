import { api } from "@merimoar/convex/api";
import { IconArrowRight } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { TaskStatus } from "#/components/agents/agent-status.tsx";
import type {
	PendingApprovalGroup,
	RecentDelegation,
} from "#/components/agents/agent-types.ts";
import { ApprovalActions } from "#/components/agents/task-activity.tsx";
import { borderedSurfaceClassName } from "#/components/ui/field-surface.ts";
import { formatDateTime } from "#/lib/date-format.ts";
import { cn } from "#/lib/utils.ts";

export function AgentInboxPage() {
	const groups = useQuery(api.agent.reader.listPendingApprovals, {});
	const delegations = useQuery(api.agent.reader.listRecentDelegations, {});

	return (
		<div className="h-full overflow-y-auto">
			<div className="w-full space-y-8 p-6">
				<h1 className="text-2xl font-semibold tracking-tight">Agent inbox</h1>
				<div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
					<section aria-labelledby="agent-inbox-attention">
						<h2 id="agent-inbox-attention" className="font-semibold">
							Approvals that need attention
						</h2>
						<div className="mt-3 space-y-2">
							{groups === undefined && (
								<InboxEmptyState text="Loading approvals…" />
							)}
							{groups?.length === 0 && (
								<InboxEmptyState text="No approvals need attention" />
							)}
							{groups?.map((group) => (
								<ApprovalGroup key={group.taskId} group={group} />
							))}
						</div>
					</section>

					<section aria-labelledby="recent-delegations-heading">
						<h2 id="recent-delegations-heading" className="font-semibold">
							Recent delegations
						</h2>
						<div className="mt-3 space-y-2">
							{delegations === undefined && (
								<InboxEmptyState text="Loading delegations…" />
							)}
							{delegations?.length === 0 && (
								<InboxEmptyState text="No recent delegations" />
							)}
							{delegations?.map((delegation) => (
								<RecentDelegationRow
									key={delegation.taskId}
									delegation={delegation}
								/>
							))}
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}

function InboxEmptyState({ text }: { text: string }) {
	return (
		<p className="rounded-xl border px-4 py-10 text-center text-sm text-muted-foreground">
			{text}
		</p>
	);
}

function RecentDelegationRow({ delegation }: { delegation: RecentDelegation }) {
	return (
		<Link
			to="/agents"
			search={{ view: "tasks", task: delegation.taskId }}
			className={cn(
				"flex items-start gap-3 rounded-xl p-4 text-foreground no-underline outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
				borderedSurfaceClassName,
			)}
			aria-label={`Open task: ${delegation.anchorCase.title}`}
		>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
					<p className="truncate text-sm font-semibold">
						{delegation.anchorCase.title}
					</p>
					<time
						dateTime={new Date(delegation.task.requestedAt).toISOString()}
						className="text-xs text-muted-foreground"
					>
						{formatDateTime(delegation.task.requestedAt)}
					</time>
				</div>
				<div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
					<p className="text-xs text-muted-foreground">
						{delegation.anchorCase.reference}
					</p>
					<TaskStatus status={delegation.task.status} />
				</div>
			</div>
			<IconArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
		</Link>
	);
}

function ApprovalGroup({ group }: { group: PendingApprovalGroup }) {
	const latestAt = Math.max(
		...group.approvals.map((approval) => approval.item.createdAt),
	);

	return (
		<article
			className={cn(
				"rounded-xl p-4 transition-colors hover:bg-muted",
				borderedSurfaceClassName,
			)}
		>
			<Link
				to="/agents"
				search={{ view: "tasks", task: group.taskId }}
				className="flex items-start gap-3 rounded-sm text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
				aria-label={`Open task: ${group.anchorCase.title}`}
			>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
						<p className="text-sm font-semibold">{group.anchorCase.title}</p>
						<time
							dateTime={new Date(latestAt).toISOString()}
							className="text-xs text-muted-foreground"
						>
							{formatDateTime(latestAt)}
						</time>
					</div>
					<p className="mt-0.5 text-xs text-muted-foreground">
						{group.anchorCase.reference}
					</p>
				</div>
				<IconArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
			</Link>

			<div className="mt-4 space-y-3">
				{group.approvals.map(({ itemId, item }) => (
					<p key={itemId} className="text-sm leading-6">
						{item.kind === "approval" ? item.request : null}
					</p>
				))}
			</div>
			<ApprovalActions
				taskId={group.taskId}
				approvalIds={group.approvals.flatMap(({ item }) =>
					item.kind === "approval" ? [item.approvalId] : [],
				)}
			/>
		</article>
	);
}
