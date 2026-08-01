import { api } from "@merimoar/convex/api";
import type { Id } from "@merimoar/convex/data-model";
import {
	IconArrowCurveRight,
	IconCheck,
	IconChevronDown,
	IconFileSearch,
	IconPencil,
	IconSearch,
	IconTool,
	IconX,
} from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { usePaginatedQuery } from "convex-helpers/react/cache";
import { useState } from "react";
import {
	type AgentItem,
	type AgentItemRecord,
	type AgentTaskStatus,
	getAgentItemText,
	getRequestedByLabel,
} from "#/components/agents/agent-types.ts";
import { RetryTaskButton } from "#/components/agents/retry-task-button.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "#/components/ui/collapsible.tsx";
import { Marker, MarkerContent, MarkerIcon } from "#/components/ui/marker.tsx";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "#/components/ui/message-scroller.tsx";
import { showAppNotification } from "#/lib/app-notifications.ts";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";
import { formatDateTime, formatTime } from "#/lib/date-format.ts";
import { cn } from "#/lib/utils.ts";

export function TaskActivity({
	taskId,
	taskStatus,
}: {
	taskId: Id<"agentTasks">;
	taskStatus: AgentTaskStatus;
}) {
	const turns = usePaginatedQuery(
		api.agent.reader.listTurns,
		{ taskId },
		{ initialNumItems: 20 },
	);

	if (turns.status === "LoadingFirstPage") {
		return <p className="text-sm text-muted-foreground">Loading activity…</p>;
	}
	if (turns.results.length === 0) {
		return <p className="text-sm text-muted-foreground">No activity yet.</p>;
	}

	return (
		<div className="h-[min(44rem,70vh)] min-h-96">
			<MessageScrollerProvider
				autoScroll
				defaultScrollPosition="last-anchor"
				scrollPreviousItemPeek={40}
			>
				<MessageScroller className="before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-10 before:bg-linear-to-b before:from-background before:to-transparent before:content-['']">
					<MessageScrollerViewport>
						<MessageScrollerContent className="gap-10 px-1 pt-10 pb-36">
							{turns.results.map(
								({ turnId, turn, requestedByMember }, index) => (
									<MessageScrollerItem
										key={turnId}
										messageId={turnId}
										scrollAnchor
									>
										<section
											aria-label={`${turn.sequence === 1 ? "Delegated" : "Resumed"} ${formatDateTime(turn.requestedAt)}`}
										>
											<Marker variant="separator">
												<MarkerContent>
													{turn.sequence === 1 ? "Delegated" : "Resumed"} by{" "}
													{getRequestedByLabel(
														turn.requestedBy,
														requestedByMember,
													)}{" "}
													at {formatDateTime(turn.requestedAt)}
												</MarkerContent>
											</Marker>
											<TurnItems
												taskId={taskId}
												turnId={turnId}
												taskStatus={taskStatus}
												isLatestTurn={
													index === turns.results.length - 1 &&
													turns.status === "Exhausted"
												}
											/>
										</section>
									</MessageScrollerItem>
								),
							)}
							{turns.status === "CanLoadMore" && (
								<MessageScrollerItem>
									<Button
										variant="outline"
										size="sm"
										onClick={() => turns.loadMore(20)}
									>
										Load more activity
									</Button>
								</MessageScrollerItem>
							)}
							{taskStatus === "failed" && (
								<MessageScrollerItem messageId="retry-task">
									<div className="flex justify-end">
										<RetryTaskButton taskId={taskId} />
									</div>
								</MessageScrollerItem>
							)}
						</MessageScrollerContent>
					</MessageScrollerViewport>
					<MessageScrollerButton />
				</MessageScroller>
			</MessageScrollerProvider>
		</div>
	);
}

function TurnItems({
	taskId,
	turnId,
	taskStatus,
	isLatestTurn,
}: {
	taskId: Id<"agentTasks">;
	turnId: Id<"agentTurns">;
	taskStatus: AgentTaskStatus;
	isLatestTurn: boolean;
}) {
	const items = usePaginatedQuery(
		api.agent.reader.listItems,
		{ taskId, turnId },
		{ initialNumItems: 100 },
	);

	if (items.status === "LoadingFirstPage") {
		return (
			<p className="mt-6 text-sm text-muted-foreground">Loading activity…</p>
		);
	}

	const visibleItems = items.results.filter(
		({ item }) => !isStartedWorkingActivity(item),
	);
	const entries = groupConsecutiveTools(
		visibleItems,
		isLatestTurn && taskStatus === "active",
	);

	return (
		<div className="mt-6 space-y-5">
			{entries.map((entry) =>
				entry.kind === "tool-group" ? (
					<ToolActivityGroup
						key={entry.items.map((item) => item.itemId).join(":")}
						items={entry.items}
						live={entry.live}
					/>
				) : (
					<ActivityItem
						key={entry.item.itemId}
						item={entry.item}
						turnItems={items.results}
						taskId={taskId}
						taskStatus={taskStatus}
					/>
				),
			)}
			{items.status === "CanLoadMore" && (
				<Button variant="outline" size="sm" onClick={() => items.loadMore(100)}>
					Load more activity
				</Button>
			)}
		</div>
	);
}

export function RecentTaskActivity({
	items,
	animateItems = false,
}: {
	items: AgentItemRecord[];
	animateItems?: boolean;
}) {
	const visibleItems = items.filter(
		({ item }) => !isStartedWorkingActivity(item),
	);
	if (visibleItems.length === 0) {
		return <p className="text-xs text-muted-foreground">No activity yet.</p>;
	}

	return (
		<div className="space-y-3">
			{visibleItems.map(({ itemId, item }) => (
				<Marker
					key={itemId}
					className={cn(
						"gap-0",
						animateItems &&
							"animate-in fade-in duration-150 ease-out motion-reduce:animate-none",
					)}
				>
					<MarkerIcon className="mr-1 size-1">
						<span className="block size-1 rounded-full bg-border" />
					</MarkerIcon>
					<MarkerContent className="flex-1 text-foreground">
						{getAgentItemText(item)}
					</MarkerContent>
					<time
						dateTime={new Date(item.createdAt).toISOString()}
						className="ml-2 shrink-0 text-xs"
					>
						{formatTime(item.createdAt)}
					</time>
				</Marker>
			))}
		</div>
	);
}

function isStartedWorkingActivity(item: AgentItem) {
	return (
		item.kind === "activity" &&
		item.title.trim().toLowerCase() === "started working"
	);
}

type ToolItem = Extract<AgentItem, { kind: "tool" }>;
type ToolItemRecord = AgentItemRecord & { item: ToolItem };
type ActivityEntry =
	| { kind: "item"; item: AgentItemRecord }
	| { kind: "tool-group"; items: ToolItemRecord[]; live: boolean };

function groupConsecutiveTools(items: AgentItemRecord[], turnIsLive: boolean) {
	const entries: ActivityEntry[] = [];
	let index = 0;

	while (index < items.length) {
		const item = items[index];
		if (!item) break;
		if (!isToolItemRecord(item)) {
			entries.push({ kind: "item", item });
			index += 1;
			continue;
		}

		const tools: ToolItemRecord[] = [item];
		index += 1;
		while (index < items.length) {
			const next = items[index];
			if (!next || !isToolItemRecord(next)) break;
			tools.push(next);
			index += 1;
		}

		if (tools.length === 1) {
			entries.push({ kind: "item", item });
			continue;
		}
		entries.push({
			kind: "tool-group",
			items: tools,
			live: index === items.length && turnIsLive,
		});
	}

	return entries;
}

function isToolItemRecord(item: AgentItemRecord): item is ToolItemRecord {
	return item.item.kind === "tool";
}

function ActivityItem({
	item: record,
	turnItems,
	taskId,
	taskStatus,
}: {
	item: AgentItemRecord;
	turnItems: AgentItemRecord[];
	taskId: Id<"agentTasks">;
	taskStatus: AgentTaskStatus;
}) {
	const { item } = record;
	if (item.kind === "agent_message") {
		return (
			<article>
				<p className="max-w-3xl text-base leading-7">{item.body}</p>
				<ItemTime at={item.createdAt} />
			</article>
		);
	}

	if (item.kind === "member_message_steer") {
		return (
			<article className="flex flex-col items-end">
				<div className="max-w-2xl rounded-2xl bg-muted px-4 py-3">
					<p className="text-sm leading-6">{item.body}</p>
				</div>
				<div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
					<p className="flex items-center gap-1 font-medium">
						<IconArrowCurveRight className="size-3.5" />
						Steered the agent
					</p>
					<time dateTime={new Date(item.createdAt).toISOString()}>
						{formatTime(item.createdAt)}
					</time>
				</div>
			</article>
		);
	}

	if (item.kind === "member_message" || item.kind === "system_message") {
		return (
			<article className="flex flex-col items-end">
				<div className="max-w-2xl rounded-2xl bg-muted px-4 py-3">
					<p className="text-sm leading-6">{item.body}</p>
				</div>
				<ItemTime at={item.createdAt} />
			</article>
		);
	}

	if (item.kind === "tool") {
		return <ToolActivity item={item} />;
	}

	if (item.kind === "activity") {
		return (
			<article>
				<p className="max-w-3xl text-base leading-7">
					{item.detail ?? item.title}
				</p>
				<ItemTime at={item.createdAt} />
			</article>
		);
	}

	if (item.kind === "approval") {
		const tool = item.toolItemId
			? turnItems.find(
					(candidate) =>
						candidate.itemId === item.toolItemId &&
						candidate.item.kind === "tool",
				)?.item
			: undefined;
		return (
			<ApprovalActivity
				item={item}
				tool={tool?.kind === "tool" ? tool : undefined}
				taskId={taskId}
				canRespond={
					item.status === "pending" && taskStatus === "waiting_for_approval"
				}
			/>
		);
	}

	return (
		<article>
			<Marker>
				<MarkerIcon>
					<span className="mt-1 block size-2 rounded-full bg-destructive" />
				</MarkerIcon>
				<MarkerContent className="flex-1 font-medium text-foreground">
					{getAgentItemText(item)}
				</MarkerContent>
				<time
					dateTime={new Date(item.createdAt).toISOString()}
					className="shrink-0 text-xs"
				>
					{formatTime(item.createdAt)}
				</time>
			</Marker>
		</article>
	);
}

function ToolActivity({ item }: { item: ToolItem }) {
	const ToolIcon = getToolIcon(item.toolName);

	return (
		<details className="group">
			<summary className="cursor-pointer list-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
				<Marker>
					<MarkerIcon>
						<ToolIcon
							className={cn(item.status === "failed" && "text-destructive")}
						/>
					</MarkerIcon>
					<MarkerContent className="flex-1 text-foreground">
						<ToolActivityTitle item={item} />
					</MarkerContent>
					<span
						className={cn(
							"shrink-0 text-xs text-muted-foreground",
							item.status === "failed" && "text-destructive",
						)}
					>
						{toolStatusLabel(item.status)}
					</span>
					<time
						dateTime={new Date(item.createdAt).toISOString()}
						className="shrink-0 text-xs"
					>
						{formatTime(item.createdAt)}
					</time>
					<IconChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
				</Marker>
			</summary>
			<ToolRawDetails tool={item} className="mt-3 ml-6" />
		</details>
	);
}

function ToolActivityGroup({
	items,
	live,
}: {
	items: ToolItemRecord[];
	live: boolean;
}) {
	const latestTool = items.at(-1)?.item;
	if (!latestTool) return null;

	return (
		<Collapsible>
			<CollapsibleTrigger className="group w-full cursor-pointer rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
				<Marker>
					<MarkerIcon>
						<IconTool
							className={cn(
								latestTool.status === "failed" && "text-destructive",
							)}
						/>
					</MarkerIcon>
					<MarkerContent className="flex-1 text-foreground">
						{live ? (
							<ToolActivityTitle item={latestTool} />
						) : (
							summarizeToolGroup(items.map(({ item }) => item))
						)}
					</MarkerContent>
					<time
						dateTime={new Date(latestTool.createdAt).toISOString()}
						className="shrink-0 text-xs text-muted-foreground"
					>
						{formatTime(latestTool.createdAt)}
					</time>
					<IconChevronDown className="size-4 shrink-0 transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none" />
				</Marker>
			</CollapsibleTrigger>
			<CollapsibleContent className="mt-4 ml-6 space-y-4">
				{items.map(({ item, itemId }) => (
					<ToolActivity key={itemId} item={item} />
				))}
			</CollapsibleContent>
		</Collapsible>
	);
}

function ToolActivityTitle({ item }: { item: ToolItem }) {
	if (item.toolName !== "update_task_status") return item.summary;
	const status = getUpdatedTaskStatus(item);
	if (!status) return item.summary;

	const prefix =
		item.status === "completed"
			? "Updated task status to"
			: item.status === "failed"
				? "Failed to update task status to"
				: "Updating task status to";
	return (
		<>
			{prefix} <span className="font-medium">{formatToolValue(status)}</span>
		</>
	);
}

function getUpdatedTaskStatus(item: ToolItem) {
	if (
		item.status === "completed" &&
		item.taskStatusUpdate &&
		"status" in item.taskStatusUpdate
	) {
		return item.taskStatusUpdate.status;
	}
	try {
		const input = JSON.parse(item.inputJson) as { status?: unknown };
		return typeof input.status === "string" ? input.status : null;
	} catch {
		return null;
	}
}

type ToolCategory = "search" | "inspect" | "mutation";

const SUMMARY_BY_TOOL_CATEGORY: Record<ToolCategory, string> = {
	search: "made searches",
	inspect: "inspected records",
	mutation: "made updates",
};

function getToolCategory(toolName: string): ToolCategory {
	if (toolName.includes("search")) return "search";
	if (toolName.startsWith("inspect_") || toolName.startsWith("read_")) {
		return "inspect";
	}
	return "mutation";
}

function getToolIcon(toolName: string) {
	switch (getToolCategory(toolName)) {
		case "search":
			return IconSearch;
		case "inspect":
			return IconFileSearch;
		case "mutation":
			return IconPencil;
	}
}

function summarizeToolGroup(items: ToolItem[]) {
	const categories = new Set(
		items.map((item) => getToolCategory(item.toolName)),
	);
	const summary = formatConjunctionList(
		Array.from(categories, (category) => SUMMARY_BY_TOOL_CATEGORY[category]),
	);
	return summary.charAt(0).toUpperCase() + summary.slice(1);
}

function formatConjunctionList(items: readonly string[]) {
	if (items.length < 2) return items.join("");
	const leadingItems = items.slice(0, -1).join(", ");
	const lastItem = items.slice(-1).join("");
	return `${leadingItems} and ${lastItem}`;
}

function formatToolValue(value: string) {
	return value.replaceAll("_", " ");
}

function toolStatusLabel(status: ToolItem["status"]) {
	switch (status) {
		case "started":
			return "Running";
		case "approval_required":
			return "Approval required";
		case "completed":
			return "Completed";
		case "failed":
			return "Failed";
	}
}

function ToolRawDetails({
	tool,
	className,
}: {
	tool: Extract<AgentItem, { kind: "tool" }>;
	className?: string;
}) {
	return (
		<dl className={cn("grid max-w-3xl gap-3 text-xs", className)}>
			<div>
				<dt className="font-medium">Tool</dt>
				<dd className="mt-0.5 font-mono text-muted-foreground">
					{tool.toolName}
				</dd>
			</div>
			<RawJsonDetail label="Input" value={tool.inputJson} />
			{tool.status === "completed" && tool.outputJson !== undefined && (
				<RawJsonDetail label="Output" value={tool.outputJson} />
			)}
			{tool.status === "failed" && (
				<div>
					<dt className="font-medium">Error</dt>
					<dd className="mt-0.5 text-muted-foreground">{tool.error}</dd>
				</div>
			)}
			{"durationMs" in tool && tool.durationMs !== undefined && (
				<div>
					<dt className="font-medium">Duration</dt>
					<dd className="mt-0.5 text-muted-foreground">{tool.durationMs} ms</dd>
				</div>
			)}
		</dl>
	);
}

function RawJsonDetail({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<dt className="font-medium">{label}</dt>
			<dd>
				<pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-muted-foreground">
					{formatRawJson(value)}
				</pre>
			</dd>
		</div>
	);
}

function ApprovalActivity({
	item,
	tool,
	taskId,
	canRespond,
}: {
	item: Extract<AgentItem, { kind: "approval" }>;
	tool?: Extract<AgentItem, { kind: "tool" }>;
	taskId: Id<"agentTasks">;
	canRespond: boolean;
}) {
	return (
		<details className="group">
			<summary className="cursor-pointer list-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
				<Marker>
					<MarkerIcon>
						<span className="mt-1 block size-2 rounded-full bg-amber-500" />
					</MarkerIcon>
					<MarkerContent className="flex-1 font-medium text-foreground">
						{item.request}
					</MarkerContent>
					<time
						dateTime={new Date(item.createdAt).toISOString()}
						className="shrink-0 text-xs"
					>
						{formatTime(item.createdAt)}
					</time>
					<IconChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
				</Marker>
			</summary>
			<div className="mt-3 ml-6 max-w-3xl">
				{tool && <ToolRawDetails tool={tool} />}
				{canRespond && (
					<ApprovalActions taskId={taskId} approvalIds={[item.approvalId]} />
				)}
				{item.status !== "pending" && <ApprovalResolution item={item} />}
			</div>
		</details>
	);
}

export function ApprovalActions({
	taskId,
	approvalIds,
}: {
	taskId: Id<"agentTasks">;
	approvalIds: string[];
}) {
	const answerApprovals = useMutation(api.agent.tasks.answerApprovals);
	const [isAnswering, setIsAnswering] = useState(false);

	async function answer(approved: boolean) {
		setIsAnswering(true);
		try {
			await answerApprovals({
				taskId,
				answers: approvalIds.map((approvalId) => ({
					approvalId,
					approved,
				})),
			});
		} catch (error) {
			showAppNotification({
				title: "Could not answer the approval",
				description: getConvexErrorMessage(error),
			});
		} finally {
			setIsAnswering(false);
		}
	}

	return (
		<div className="mt-3 flex flex-wrap gap-2">
			<Button
				size="sm"
				disabled={isAnswering}
				onClick={() => void answer(true)}
			>
				Approve
			</Button>
			<Button
				size="sm"
				variant="outline"
				disabled={isAnswering}
				onClick={() => void answer(false)}
			>
				Reject
			</Button>
		</div>
	);
}

function ApprovalResolution({
	item,
}: {
	item: Extract<AgentItem, { kind: "approval"; status: "approved" | "denied" }>;
}) {
	return (
		<div className="mt-3 text-xs">
			<p className="flex items-center gap-1.5 font-medium">
				{item.status === "approved" ? (
					<IconCheck className="size-3.5" />
				) : (
					<IconX className="size-3.5" />
				)}
				{item.status === "approved" ? "Approved" : "Rejected"}
				<span aria-hidden> · </span>
				<time dateTime={new Date(item.answeredAt).toISOString()}>
					{formatDateTime(item.answeredAt)}
				</time>
			</p>
			{item.answerReason && (
				<p className="mt-1 leading-5 text-muted-foreground">
					{item.answerReason}
				</p>
			)}
		</div>
	);
}

function ItemTime({ at }: { at: number }) {
	return (
		<time
			dateTime={new Date(at).toISOString()}
			className="mt-1 block text-xs text-muted-foreground"
		>
			{formatTime(at)}
		</time>
	);
}

function formatRawJson(value: string) {
	try {
		return JSON.stringify(JSON.parse(value), null, 2);
	} catch {
		return value;
	}
}
