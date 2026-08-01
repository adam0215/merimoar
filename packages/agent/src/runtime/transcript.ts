import type { JSONValue, ModelMessage } from "ai";
import type { PersistedItem, PersistedTranscript } from "../types";

type ToolApproval = Extract<PersistedItem, { kind: "approval" }>;
type ToolApprovalResponse = {
	type: "tool-approval-response";
	approvalId: string;
	approved: boolean;
	reason?: string;
};

export function buildModelMessages(
	transcript: PersistedTranscript,
	runId: string,
): ModelMessage[] {
	const items: PersistedItem[] = [...transcript.turns]
		.sort((left, right) => left.sequence - right.sequence)
		.flatMap((turn) =>
			[...turn.items].sort((left, right) => left.sequence - right.sequence),
		);
	const approvalsByToolItemId = new Map<string, ToolApproval>();
	for (const item of items) {
		if (
			item.kind === "approval" &&
			item.approvalKind === "tool" &&
			item.toolItemId
		) {
			approvalsByToolItemId.set(item.toolItemId, item);
		}
	}
	const messages: ModelMessage[] = [];
	const approvalResponses: ToolApprovalResponse[] = [];

	for (const item of items) {
		switch (item.kind) {
			case "member_message":
			case "member_message_steer":
				messages.push({ role: "user", content: item.body });
				break;
			case "system_message":
				messages.push({
					role: "user",
					content: `[${item.source}] ${item.body}`,
				});
				break;
			case "agent_message":
				if (item.body) {
					messages.push({ role: "assistant", content: item.body });
				}
				break;
			case "tool":
				appendToolMessages(
					messages,
					approvalResponses,
					item,
					approvalsByToolItemId.get(item._id),
					runId,
				);
				break;
			case "approval":
				if (
					item.approvalKind === "task" &&
					item.status !== "pending" &&
					item.continuationRunId === runId &&
					item.consumedAt === undefined
				) {
					messages.push({
						role: "user",
						content: [
							`Task approval ${item.status}: ${item.request}`,
							item.answerReason ? `Reason: ${item.answerReason}` : undefined,
						]
							.filter(Boolean)
							.join("\n"),
					});
				}
				break;
			case "activity":
			case "error":
				break;
		}
	}
	if (approvalResponses.length > 0) {
		// AI SDK 7 only replays approvals from the final tool message.
		messages.push({ role: "tool", content: approvalResponses });
	}
	return messages;
}

function appendToolMessages(
	messages: ModelMessage[],
	approvalResponses: ToolApprovalResponse[],
	item: Extract<PersistedItem, { kind: "tool" }>,
	approval: ToolApproval | undefined,
	runId: string,
) {
	const toolCall = {
		type: "tool-call" as const,
		toolCallId: item.toolCallId,
		toolName: item.toolName,
		input: parseJson(item.inputJson),
	};

	if (item.status === "approval_required" && approval) {
		if (
			approval.status !== "pending" &&
			(approval.continuationRunId !== runId ||
				approval.consumedAt !== undefined)
		) {
			return;
		}
		messages.push({
			role: "assistant",
			content: [
				toolCall,
				{
					type: "tool-approval-request",
					approvalId: approval.approvalId,
					toolCallId: item.toolCallId,
					...(approval.signature ? { signature: approval.signature } : {}),
				},
			],
		});
		if (approval.status !== "pending") {
			approvalResponses.push({
				type: "tool-approval-response",
				approvalId: approval.approvalId,
				approved: approval.status === "approved",
				...(approval.answerReason ? { reason: approval.answerReason } : {}),
			});
		}
		return;
	}

	if (item.status !== "completed" && item.status !== "failed") return;
	messages.push({ role: "assistant", content: [toolCall] });
	messages.push({
		role: "tool",
		content: [
			{
				type: "tool-result",
				toolCallId: item.toolCallId,
				toolName: item.toolName,
				output:
					item.status === "completed"
						? {
								type: "json",
								value:
									item.taskStatusUpdate ?? parseJson(item.outputJson ?? "null"),
							}
						: { type: "error-text", value: item.error },
			},
		],
	});
}

function parseJson(value: string): JSONValue {
	try {
		return JSON.parse(value) as JSONValue;
	} catch {
		return value;
	}
}
