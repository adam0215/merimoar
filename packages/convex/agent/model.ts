import { type Infer, v } from "convex/values";

// Agent keys are metadata only. Runtime implementations must not use them as
// compatibility or version gates.
export const DEFAULT_AGENT_KEY = "agent-v1";

export const agentTaskStatusValidator = v.union(
	v.literal("active"),
	v.literal("waiting"),
	v.literal("waiting_for_approval"),
	v.literal("completed"),
	v.literal("unable_to_continue"),
	v.literal("failed"),
	v.literal("cancelled"),
);

export type RequestedBy =
	| "member"
	| `system:${string}`
	| `agent:${string}`
	| `domainEvent:${string}`;

export const agentTaskBaseValidator = v.object({
	organizationId: v.id("organizations"),
	anchorCaseId: v.id("cases"),
	agentKey: v.string(),
	requestedAt: v.number(),
	requestedBy: v.string(),
	requestedByMemberId: v.optional(v.id("organizationMembers")),
	ownershipReleasedAt: v.union(v.number(), v.null()),
	activeRunIds: v.array(v.id("agentRuns")),
	activeApprovalIds: v.array(v.id("agentItems")),
});

export const agentTaskValidator = v.union(
	agentTaskBaseValidator.extend({
		status: v.literal("active"),
		ownershipReleasedAt: v.null(),
	}),
	agentTaskBaseValidator.extend({
		status: v.literal("waiting"),
		waitingReason: v.string(),
		ownershipReleasedAt: v.null(),
	}),
	agentTaskBaseValidator.extend({
		status: v.literal("waiting_for_approval"),
		ownershipReleasedAt: v.null(),
	}),
	agentTaskBaseValidator.extend({
		status: v.literal("completed"),
		result: v.string(),
		ownershipReleasedAt: v.number(),
	}),
	agentTaskBaseValidator.extend({
		status: v.literal("unable_to_continue"),
		result: v.string(),
		ownershipReleasedAt: v.number(),
	}),
	agentTaskBaseValidator.extend({
		status: v.literal("failed"),
		error: v.string(),
		ownershipReleasedAt: v.number(),
	}),
	agentTaskBaseValidator.extend({
		status: v.literal("cancelled"),
		reason: v.string(),
		ownershipReleasedAt: v.number(),
	}),
);

export const agentRunUsageValidator = v.object({
	inputTokens: v.optional(v.number()),
	outputTokens: v.optional(v.number()),
	totalTokens: v.optional(v.number()),
});

export const agentTurnValidator = v.object({
	taskId: v.id("agentTasks"),
	sequence: v.number(),
	requestedAt: v.number(),
	requestedBy: v.string(),
	requestedByMemberId: v.optional(v.id("organizationMembers")),
});

export const agentTaskStatusUpdateValidator = v.union(
	v.object({
		status: v.literal("completed"),
		result: v.string(),
	}),
	v.object({
		status: v.literal("waiting"),
		reason: v.string(),
	}),
	v.object({
		status: v.literal("waiting_for_approval"),
		approvalId: v.string(),
		approvalRequest: v.string(),
	}),
	v.object({
		status: v.literal("unable_to_continue"),
		result: v.string(),
	}),
);

export const agentRunBaseValidator = v.object({
	turnId: v.id("agentTurns"),
	requestedAt: v.number(),
	attemptCount: v.number(),
	leaseFailureCount: v.optional(v.number()),
	leaseGeneration: v.number(),
	lastSteeringSequence: v.optional(v.number()),
	selectedStatusItemId: v.optional(v.id("agentItems")),
	customToolSnapshotCreatedAt: v.optional(v.number()),
});

export const agentRunValidator = v.union(
	agentRunBaseValidator.extend({
		status: v.literal("queued"),
	}),
	agentRunBaseValidator.extend({
		status: v.literal("running"),
		claimToken: v.string(),
		claimedAt: v.number(),
		leaseExpiresAt: v.number(),
		startedAt: v.number(),
	}),
	agentRunBaseValidator.extend({
		status: v.literal("completed"),
		endedAt: v.number(),
		usage: v.optional(agentRunUsageValidator),
	}),
	agentRunBaseValidator.extend({
		status: v.literal("failed"),
		endedAt: v.number(),
		error: v.string(),
	}),
	agentRunBaseValidator.extend({
		status: v.literal("cancelled"),
		endedAt: v.number(),
		reason: v.string(),
	}),
);

export const agentItemBaseValidator = v.object({
	turnId: v.id("agentTurns"),
	sequence: v.number(),
	createdAt: v.number(),
});

export const agentToolItemBaseValidator = agentItemBaseValidator.extend({
	kind: v.literal("tool"),
	runId: v.id("agentRuns"),
	toolCallId: v.string(),
	toolName: v.string(),
	customToolId: v.optional(v.id("agentCustomTools")),
	inputJson: v.string(),
	summary: v.string(),
});

const agentApprovalItemBaseValidator = agentItemBaseValidator.extend({
	kind: v.literal("approval"),
	approvalId: v.string(),
	request: v.string(),
});

// Historical approvals may still contain a reason. New decisions do not write
// or project it, but retaining the optional field keeps that audit data intact.
const deprecatedApprovalAnswerReasonValidator = {
	answerReason: v.optional(v.string()),
};

export const agentApprovalInvalidationCauseValidator = v.union(
	v.object({
		kind: v.literal("inbound_email_received"),
		messageId: v.id("emailMessages"),
	}),
	v.object({
		kind: v.literal("email_tool_disabled"),
	}),
);

export const agentItemValidator = v.union(
	agentItemBaseValidator.extend({
		kind: v.literal("member_message"),
		body: v.string(),
		memberId: v.id("organizationMembers"),
	}),
	agentItemBaseValidator.extend({
		kind: v.literal("member_message_steer"),
		runId: v.id("agentRuns"),
		body: v.string(),
		memberId: v.id("organizationMembers"),
	}),
	agentItemBaseValidator.extend({
		kind: v.literal("system_message"),
		body: v.string(),
		source: v.string(),
		runId: v.optional(v.id("agentRuns")),
		inboundEmailMessageCount: v.optional(v.number()),
		emailThreadId: v.optional(v.id("emailThreads")),
	}),
	agentItemBaseValidator.extend({
		kind: v.literal("agent_message"),
		runId: v.id("agentRuns"),
		body: v.string(),
	}),
	agentToolItemBaseValidator.extend({
		status: v.literal("started"),
	}),
	agentToolItemBaseValidator.extend({
		status: v.literal("approval_required"),
	}),
	agentToolItemBaseValidator.extend({
		status: v.literal("completed"),
		outputJson: v.string(),
		durationMs: v.optional(v.number()),
	}),
	agentToolItemBaseValidator.extend({
		toolName: v.literal("update_task_status"),
		status: v.literal("completed"),
		taskStatusUpdate: agentTaskStatusUpdateValidator,
	}),
	agentToolItemBaseValidator.extend({
		status: v.literal("failed"),
		error: v.string(),
		durationMs: v.optional(v.number()),
	}),
	agentApprovalItemBaseValidator.extend({
		approvalKind: v.literal("tool"),
		toolItemId: v.id("agentItems"),
		status: v.literal("pending"),
		signature: v.optional(v.string()),
	}),
	agentApprovalItemBaseValidator.extend({
		approvalKind: v.literal("task"),
		status: v.literal("pending"),
	}),
	agentApprovalItemBaseValidator.extend({
		approvalKind: v.literal("tool"),
		toolItemId: v.id("agentItems"),
		status: v.union(v.literal("approved"), v.literal("denied")),
		signature: v.optional(v.string()),
		answeredByMemberId: v.id("organizationMembers"),
		answeredAt: v.number(),
		...deprecatedApprovalAnswerReasonValidator,
		continuationRunId: v.optional(v.id("agentRuns")),
		consumedAt: v.optional(v.number()),
	}),
	agentApprovalItemBaseValidator.extend({
		approvalKind: v.literal("tool"),
		toolItemId: v.id("agentItems"),
		status: v.literal("invalidated"),
		signature: v.optional(v.string()),
		invalidatedAt: v.number(),
		invalidationCause: agentApprovalInvalidationCauseValidator,
		continuationRunId: v.optional(v.id("agentRuns")),
		consumedAt: v.optional(v.number()),
	}),
	agentApprovalItemBaseValidator.extend({
		approvalKind: v.literal("task"),
		status: v.union(v.literal("approved"), v.literal("denied")),
		answeredByMemberId: v.id("organizationMembers"),
		answeredAt: v.number(),
		...deprecatedApprovalAnswerReasonValidator,
		continuationRunId: v.optional(v.id("agentRuns")),
		consumedAt: v.optional(v.number()),
	}),
	agentItemBaseValidator.extend({
		kind: v.literal("activity"),
		runId: v.id("agentRuns"),
		title: v.string(),
		detail: v.optional(v.string()),
	}),
	agentItemBaseValidator.extend({
		kind: v.literal("error"),
		runId: v.id("agentRuns"),
		message: v.string(),
		debug: v.optional(v.string()),
	}),
);

export type AgentTask = Infer<typeof agentTaskValidator>;
export type AgentRun = Infer<typeof agentRunValidator>;
export type AgentTaskStatusUpdate = Infer<
	typeof agentTaskStatusUpdateValidator
>;

function agentTaskIdentityFields(task: AgentTask) {
	return {
		organizationId: task.organizationId,
		anchorCaseId: task.anchorCaseId,
		agentKey: task.agentKey,
		requestedAt: task.requestedAt,
		requestedBy: task.requestedBy,
		...(task.requestedByMemberId
			? { requestedByMemberId: task.requestedByMemberId }
			: {}),
	};
}

export function ownedAgentTaskFields(task: AgentTask) {
	return {
		...agentTaskIdentityFields(task),
		activeRunIds: task.activeRunIds,
		activeApprovalIds: task.activeApprovalIds,
		ownershipReleasedAt: null,
	};
}

export function terminalAgentTaskFields(task: AgentTask, endedAt: number) {
	return {
		...agentTaskIdentityFields(task),
		activeRunIds: [],
		activeApprovalIds: [],
		ownershipReleasedAt: endedAt,
	};
}

export function agentRunBaseFields(run: AgentRun) {
	return {
		turnId: run.turnId,
		requestedAt: run.requestedAt,
		attemptCount: run.attemptCount,
		leaseFailureCount: run.leaseFailureCount ?? 0,
		leaseGeneration: run.leaseGeneration,
		...(run.lastSteeringSequence === undefined
			? {}
			: { lastSteeringSequence: run.lastSteeringSequence }),
		...(run.selectedStatusItemId
			? { selectedStatusItemId: run.selectedStatusItemId }
			: {}),
		...(run.customToolSnapshotCreatedAt === undefined
			? {}
			: { customToolSnapshotCreatedAt: run.customToolSnapshotCreatedAt }),
	};
}
