import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import {
	agentApprovalInvalidationCauseValidator,
	agentTaskStatusUpdateValidator,
} from "#/agent/model";
import type { Doc } from "../_generated/dataModel";

export const transcriptItemValidator = v.union(
	v.object({
		kind: v.literal("member_message"),
		body: v.string(),
		sequence: v.number(),
	}),
	v.object({
		kind: v.literal("member_message_steer"),
		runId: v.id("agentRuns"),
		body: v.string(),
		sequence: v.number(),
	}),
	v.object({
		kind: v.literal("system_message"),
		body: v.string(),
		source: v.string(),
		runId: v.optional(v.id("agentRuns")),
		inboundEmailMessageCount: v.optional(v.number()),
		sequence: v.number(),
	}),
	v.object({
		kind: v.literal("agent_message"),
		body: v.string(),
		sequence: v.number(),
	}),
	v.object({
		kind: v.literal("tool"),
		_id: v.id("agentItems"),
		toolCallId: v.string(),
		toolName: v.string(),
		runId: v.id("agentRuns"),
		inputJson: v.string(),
		sequence: v.number(),
		status: v.union(v.literal("started"), v.literal("approval_required")),
	}),
	v.object({
		kind: v.literal("tool"),
		_id: v.id("agentItems"),
		toolCallId: v.string(),
		toolName: v.string(),
		runId: v.id("agentRuns"),
		inputJson: v.string(),
		sequence: v.number(),
		status: v.literal("completed"),
		outputJson: v.optional(v.string()),
		taskStatusUpdate: v.optional(agentTaskStatusUpdateValidator),
	}),
	v.object({
		kind: v.literal("tool"),
		_id: v.id("agentItems"),
		toolCallId: v.string(),
		toolName: v.string(),
		runId: v.id("agentRuns"),
		inputJson: v.string(),
		sequence: v.number(),
		status: v.literal("failed"),
		error: v.string(),
	}),
	v.object({
		kind: v.literal("approval"),
		approvalId: v.string(),
		approvalKind: v.union(v.literal("tool"), v.literal("task")),
		toolItemId: v.optional(v.id("agentItems")),
		signature: v.optional(v.string()),
		request: v.string(),
		status: v.union(
			v.literal("pending"),
			v.literal("approved"),
			v.literal("denied"),
			v.literal("invalidated"),
		),
		invalidatedAt: v.optional(v.number()),
		invalidationCause: v.optional(agentApprovalInvalidationCauseValidator),
		continuationRunId: v.optional(v.id("agentRuns")),
		consumedAt: v.optional(v.number()),
		sequence: v.number(),
	}),
	v.object({
		kind: v.literal("activity"),
		title: v.string(),
		detail: v.optional(v.string()),
		sequence: v.number(),
	}),
	v.object({
		kind: v.literal("error"),
		sequence: v.number(),
	}),
);

export const transcriptTurnValidator = v.object({
	turnId: v.id("agentTurns"),
	sequence: v.number(),
});

export const runtimeTranscriptPageValidator = v.object({
	taskId: v.id("agentTasks"),
	selectedStatusItemId: v.optional(v.id("agentItems")),
	turns: paginationResultValidator(transcriptTurnValidator),
});

export const transcriptItemPageValidator = paginationResultValidator(
	transcriptItemValidator,
);

export function projectTranscriptItem(item: Doc<"agentItems">) {
	switch (item.kind) {
		case "member_message":
			return { kind: item.kind, body: item.body, sequence: item.sequence };
		case "member_message_steer":
			return {
				kind: item.kind,
				runId: item.runId,
				body: item.body,
				sequence: item.sequence,
			};
		case "system_message":
			return {
				kind: item.kind,
				body: item.body,
				source: item.source,
				...(item.runId ? { runId: item.runId } : {}),
				...(item.inboundEmailMessageCount === undefined
					? {}
					: { inboundEmailMessageCount: item.inboundEmailMessageCount }),
				sequence: item.sequence,
			};
		case "agent_message":
			return { kind: item.kind, body: item.body, sequence: item.sequence };
		case "tool": {
			const base = {
				kind: item.kind,
				_id: item._id,
				toolCallId: item.toolCallId,
				toolName: item.toolName,
				runId: item.runId,
				inputJson: item.inputJson,
				sequence: item.sequence,
			};
			if (item.status === "completed") {
				return {
					...base,
					status: item.status,
					...("outputJson" in item ? { outputJson: item.outputJson } : {}),
					...("taskStatusUpdate" in item
						? { taskStatusUpdate: item.taskStatusUpdate }
						: {}),
				};
			}
			return item.status === "failed"
				? { ...base, status: item.status, error: item.error }
				: { ...base, status: item.status };
		}
		case "approval":
			return {
				kind: item.kind,
				approvalId: item.approvalId,
				approvalKind: item.approvalKind,
				...("toolItemId" in item ? { toolItemId: item.toolItemId } : {}),
				...("signature" in item && item.signature
					? { signature: item.signature }
					: {}),
				request: item.request,
				status: item.status,
				...("invalidatedAt" in item
					? {
							invalidatedAt: item.invalidatedAt,
							invalidationCause: item.invalidationCause,
						}
					: {}),
				...("continuationRunId" in item && item.continuationRunId
					? { continuationRunId: item.continuationRunId }
					: {}),
				...("consumedAt" in item && item.consumedAt !== undefined
					? { consumedAt: item.consumedAt }
					: {}),
				sequence: item.sequence,
			};
		case "activity":
			return {
				kind: item.kind,
				title: item.title,
				...(item.detail ? { detail: item.detail } : {}),
				sequence: item.sequence,
			};
		case "error":
			return { kind: item.kind, sequence: item.sequence };
	}
}
