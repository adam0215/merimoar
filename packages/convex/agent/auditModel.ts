import { v } from "convex/values";
import {
	agentItemBaseValidator,
	agentRunBaseValidator,
	agentRunUsageValidator,
	agentTaskBaseValidator,
	agentTaskStatusUpdateValidator,
	agentToolItemBaseValidator,
} from "#/agent/model";
import type { Doc } from "../_generated/dataModel";

const auditTaskBaseValidator = agentTaskBaseValidator.pick(
	"agentKey",
	"requestedAt",
	"requestedBy",
	"requestedByMemberId",
);

export const auditTaskValidator = v.union(
	auditTaskBaseValidator.extend({ status: v.literal("active") }),
	auditTaskBaseValidator.extend({
		status: v.literal("waiting"),
		waitingReason: v.string(),
	}),
	auditTaskBaseValidator.extend({
		status: v.literal("waiting_for_approval"),
	}),
	auditTaskBaseValidator.extend({
		status: v.literal("completed"),
		result: v.string(),
		ownershipReleasedAt: v.number(),
	}),
	auditTaskBaseValidator.extend({
		status: v.literal("unable_to_continue"),
		result: v.string(),
		ownershipReleasedAt: v.number(),
	}),
	auditTaskBaseValidator.extend({
		status: v.literal("failed"),
		error: v.string(),
		ownershipReleasedAt: v.number(),
	}),
	auditTaskBaseValidator.extend({
		status: v.literal("cancelled"),
		reason: v.string(),
		ownershipReleasedAt: v.number(),
	}),
);

const auditToolBaseValidator = agentToolItemBaseValidator;

const auditApprovalBaseValidator = agentItemBaseValidator.extend({
	kind: v.literal("approval"),
	approvalId: v.string(),
	approvalKind: v.union(v.literal("tool"), v.literal("task")),
	toolItemId: v.optional(v.id("agentItems")),
	request: v.string(),
});

export const auditItemValidator = v.union(
	v.object({
		turnId: v.id("agentTurns"),
		sequence: v.number(),
		createdAt: v.number(),
		kind: v.literal("member_message"),
		body: v.string(),
		memberId: v.id("organizationMembers"),
	}),
	v.object({
		turnId: v.id("agentTurns"),
		sequence: v.number(),
		createdAt: v.number(),
		kind: v.literal("member_message_steer"),
		runId: v.id("agentRuns"),
		body: v.string(),
		memberId: v.id("organizationMembers"),
	}),
	v.object({
		turnId: v.id("agentTurns"),
		sequence: v.number(),
		createdAt: v.number(),
		kind: v.literal("system_message"),
		body: v.string(),
		source: v.string(),
	}),
	v.object({
		turnId: v.id("agentTurns"),
		sequence: v.number(),
		createdAt: v.number(),
		kind: v.literal("agent_message"),
		runId: v.id("agentRuns"),
		body: v.string(),
	}),
	auditToolBaseValidator.extend({
		status: v.union(v.literal("started"), v.literal("approval_required")),
	}),
	auditToolBaseValidator.extend({
		status: v.literal("completed"),
		outputJson: v.optional(v.string()),
		taskStatusUpdate: v.optional(agentTaskStatusUpdateValidator),
		durationMs: v.optional(v.number()),
	}),
	auditToolBaseValidator.extend({
		status: v.literal("failed"),
		error: v.string(),
		durationMs: v.optional(v.number()),
	}),
	auditApprovalBaseValidator.extend({
		status: v.literal("pending"),
	}),
	auditApprovalBaseValidator.extend({
		status: v.union(v.literal("approved"), v.literal("denied")),
		answeredByMemberId: v.id("organizationMembers"),
		answeredAt: v.number(),
		answerReason: v.optional(v.string()),
		continuationRunId: v.optional(v.id("agentRuns")),
		consumedAt: v.optional(v.number()),
	}),
	v.object({
		turnId: v.id("agentTurns"),
		sequence: v.number(),
		createdAt: v.number(),
		kind: v.literal("activity"),
		runId: v.id("agentRuns"),
		title: v.string(),
		detail: v.optional(v.string()),
	}),
	v.object({
		turnId: v.id("agentTurns"),
		sequence: v.number(),
		createdAt: v.number(),
		kind: v.literal("error"),
		runId: v.id("agentRuns"),
		message: v.string(),
	}),
);

const auditRunBaseValidator = agentRunBaseValidator.pick(
	"turnId",
	"requestedAt",
	"attemptCount",
	"leaseFailureCount",
	"selectedStatusItemId",
);

export const auditRunValidator = v.union(
	auditRunBaseValidator.extend({ status: v.literal("queued") }),
	auditRunBaseValidator.extend({
		status: v.literal("running"),
		claimedAt: v.number(),
		startedAt: v.number(),
	}),
	auditRunBaseValidator.extend({
		status: v.literal("completed"),
		endedAt: v.number(),
		usage: v.optional(agentRunUsageValidator),
	}),
	auditRunBaseValidator.extend({
		status: v.literal("failed"),
		endedAt: v.number(),
		error: v.string(),
	}),
	auditRunBaseValidator.extend({
		status: v.literal("cancelled"),
		endedAt: v.number(),
		reason: v.string(),
	}),
);

export function projectAuditTask(task: Doc<"agentTasks">) {
	const base = {
		agentKey: task.agentKey,
		requestedAt: task.requestedAt,
		requestedBy: task.requestedBy,
		...(task.requestedByMemberId
			? { requestedByMemberId: task.requestedByMemberId }
			: {}),
	};
	switch (task.status) {
		case "active":
			return { ...base, status: task.status };
		case "waiting":
			return {
				...base,
				status: task.status,
				waitingReason: task.waitingReason,
			};
		case "waiting_for_approval":
			return { ...base, status: task.status };
		case "completed":
		case "unable_to_continue":
			return {
				...base,
				status: task.status,
				result: task.result,
				ownershipReleasedAt: task.ownershipReleasedAt,
			};
		case "failed":
			return {
				...base,
				status: task.status,
				error: task.error,
				ownershipReleasedAt: task.ownershipReleasedAt,
			};
		case "cancelled":
			return {
				...base,
				status: task.status,
				reason: task.reason,
				ownershipReleasedAt: task.ownershipReleasedAt,
			};
	}
}

export function projectAuditItem(item: Doc<"agentItems">) {
	const base = {
		turnId: item.turnId,
		sequence: item.sequence,
		createdAt: item.createdAt,
	};
	switch (item.kind) {
		case "member_message":
			return {
				...base,
				kind: item.kind,
				body: item.body,
				memberId: item.memberId,
			};
		case "member_message_steer":
			return {
				...base,
				kind: item.kind,
				runId: item.runId,
				body: item.body,
				memberId: item.memberId,
			};
		case "system_message":
			return {
				...base,
				kind: item.kind,
				body: item.body,
				source: item.source,
			};
		case "agent_message":
			return { ...base, kind: item.kind, runId: item.runId, body: item.body };
		case "tool": {
			const tool = {
				...base,
				kind: item.kind,
				runId: item.runId,
				toolCallId: item.toolCallId,
				toolName: item.toolName,
				...(item.customToolId ? { customToolId: item.customToolId } : {}),
				inputJson: item.inputJson,
				summary: item.summary,
			};
			if (item.status === "completed") {
				return {
					...tool,
					status: item.status,
					...("outputJson" in item ? { outputJson: item.outputJson } : {}),
					...("taskStatusUpdate" in item
						? { taskStatusUpdate: item.taskStatusUpdate }
						: {}),
					...("durationMs" in item && item.durationMs !== undefined
						? { durationMs: item.durationMs }
						: {}),
				};
			}
			if (item.status === "failed") {
				return {
					...tool,
					status: item.status,
					error: item.error,
					...(item.durationMs === undefined
						? {}
						: { durationMs: item.durationMs }),
				};
			}
			return { ...tool, status: item.status };
		}
		case "approval": {
			const approval = {
				...base,
				kind: item.kind,
				approvalId: item.approvalId,
				approvalKind: item.approvalKind,
				...("toolItemId" in item ? { toolItemId: item.toolItemId } : {}),
				request: item.request,
			};
			if (item.status === "pending") {
				return { ...approval, status: item.status };
			}
			return {
				...approval,
				status: item.status,
				answeredByMemberId: item.answeredByMemberId,
				answeredAt: item.answeredAt,
				...(item.answerReason ? { answerReason: item.answerReason } : {}),
				...(item.continuationRunId
					? { continuationRunId: item.continuationRunId }
					: {}),
				...(item.consumedAt === undefined
					? {}
					: { consumedAt: item.consumedAt }),
			};
		}
		case "activity":
			return {
				...base,
				kind: item.kind,
				runId: item.runId,
				title: item.title,
				...(item.detail ? { detail: item.detail } : {}),
			};
		case "error":
			return {
				...base,
				kind: item.kind,
				runId: item.runId,
				message: item.message,
			};
	}
}

export function projectAuditRun(run: Doc<"agentRuns">) {
	const base = {
		turnId: run.turnId,
		requestedAt: run.requestedAt,
		attemptCount: run.attemptCount,
		...(run.leaseFailureCount === undefined
			? {}
			: { leaseFailureCount: run.leaseFailureCount }),
		...(run.selectedStatusItemId
			? { selectedStatusItemId: run.selectedStatusItemId }
			: {}),
	};
	switch (run.status) {
		case "queued":
			return { ...base, status: run.status };
		case "running":
			return {
				...base,
				status: run.status,
				claimedAt: run.claimedAt,
				startedAt: run.startedAt,
			};
		case "completed":
			return {
				...base,
				status: run.status,
				endedAt: run.endedAt,
				...(run.usage ? { usage: run.usage } : {}),
			};
		case "failed":
			return {
				...base,
				status: run.status,
				endedAt: run.endedAt,
				error: run.error,
			};
		case "cancelled":
			return {
				...base,
				status: run.status,
				endedAt: run.endedAt,
				reason: run.reason,
			};
	}
}
