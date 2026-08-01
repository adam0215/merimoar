import type { api } from "@merimoar/convex/api";
import type { FunctionReturnType } from "convex/server";

export type AgentTaskSummary = FunctionReturnType<
	typeof api.agent.reader.listWorkspaceTasks
>[number];

export type AgentTaskStatus = AgentTaskSummary["task"]["status"];

export type AgentTaskDetail = NonNullable<
	FunctionReturnType<typeof api.agent.reader.get>
>;

export type AgentItemRecord = FunctionReturnType<
	typeof api.agent.reader.listItems
>["page"][number];

export type AgentItem = AgentItemRecord["item"];

export type PendingApprovalGroup = FunctionReturnType<
	typeof api.agent.reader.listPendingApprovals
>[number];

export type RecentDelegation = FunctionReturnType<
	typeof api.agent.reader.listRecentDelegations
>[number];

export function taskRetainsAgentOwnership(status: AgentTaskStatus) {
	return (
		status === "active" ||
		status === "waiting" ||
		status === "waiting_for_approval"
	);
}

export function taskIsTerminal(status: AgentTaskStatus) {
	return !taskRetainsAgentOwnership(status);
}

export function getTaskProgress(task: AgentTaskSummary) {
	switch (task.task.status) {
		case "waiting":
			return task.task.waitingReason;
		case "waiting_for_approval":
			return `${task.pendingApprovalCount} ${
				task.pendingApprovalCount === 1 ? "approval" : "approvals"
			} pending`;
		case "completed":
		case "unable_to_continue":
			return task.task.result;
		case "failed":
			return task.task.error;
		case "cancelled":
			return task.task.reason;
		case "active":
			return task.latestItem
				? getAgentItemText(task.latestItem.item)
				: "Queued";
	}
}

export function getAgentItemText(item: AgentItem) {
	switch (item.kind) {
		case "agent_message":
		case "member_message":
		case "member_message_steer":
		case "system_message":
			return item.body;
		case "tool":
			return item.summary;
		case "approval":
			return item.request;
		case "activity":
			return item.detail ? `${item.title}: ${item.detail}` : item.title;
		case "error":
			return item.message;
	}
}

export function getRequestedByLabel(
	requestedBy: string,
	requestedByMember: { name: string } | null = null,
) {
	if (requestedByMember) return requestedByMember.name;
	if (requestedBy === "member") return "member";
	if (requestedBy.startsWith("system:")) return "system";
	if (requestedBy.startsWith("agent:")) return "agent";
	if (requestedBy.startsWith("domainEvent:")) return "automation";
	return requestedBy;
}
