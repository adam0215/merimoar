import {
	formatInboundEmailSteeringMessage,
	INBOUND_EMAIL_STEERING_SOURCE,
} from "@merimoar/agent";
import { ConvexError, v } from "convex/values";
import {
	agentRunBaseFields,
	DEFAULT_AGENT_KEY,
	ownedAgentTaskFields,
	type RequestedBy,
	terminalAgentTaskFields,
} from "#/agent/model";
import { scheduleAgentRunPush } from "#/agent/push";
import { nextItemSequence } from "#/agent/runtimeValues";
import { requireActor } from "#/auth/access";
import { requireCase } from "#/case/access";
import {
	assertAgentTaskLinkBounds,
	getActiveAgentTaskApprovals,
	getActiveAgentTaskForCase,
	MAX_ACTIVE_AGENT_APPROVALS,
	MAX_ACTIVE_AGENT_RUNS,
	resolveActiveAgentTaskLinks,
} from "#/case/agentOwnership";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { mutation } from "../_generated/server";

const MAX_RUNTIME_IDENTIFIER_LENGTH = 200;
const MAX_APPROVAL_ANSWERS = 20;
const MAX_TAKEOVER_REASON_LENGTH = 500;

function invalidAgentTask(message: string) {
	return new ConvexError({ code: "INVALID_AGENT_TASK", message });
}

function requireTaskInput(input: string) {
	if (!input.trim())
		throw invalidAgentTask("Describe what the agent should do.");
	return input;
}

function normalizeRuntimeIdentifier(value: string) {
	if (!value || value.length > MAX_RUNTIME_IDENTIFIER_LENGTH) {
		throw invalidAgentTask(
			`The identifier must contain 1 to ${MAX_RUNTIME_IDENTIFIER_LENGTH} characters.`,
		);
	}
	return value;
}

function normalizeTakeoverReason(input: string | undefined) {
	const normalized = input?.trim();
	if (!normalized) return undefined;
	if (normalized.length > MAX_TAKEOVER_REASON_LENGTH) {
		throw invalidAgentTask(
			`Use no more than ${MAX_TAKEOVER_REASON_LENGTH} characters for a takeover reason.`,
		);
	}
	return normalized;
}

async function requireTaskInOrganization(
	ctx: MutationCtx,
	taskId: Id<"agentTasks">,
	organizationId: Id<"organizations">,
) {
	const task = await ctx.db.get(taskId);
	if (!task) throw invalidAgentTask("The task could not be found.");
	assertAgentTaskLinkBounds(task);
	const anchorCase = await ctx.db.get(task.anchorCaseId);
	if (
		task.organizationId !== organizationId ||
		!anchorCase ||
		anchorCase.organizationId !== task.organizationId
	) {
		throw invalidAgentTask("The task could not be found.");
	}
	return { task, anchorCase };
}

async function getNextTurnSequence(ctx: MutationCtx, taskId: Id<"agentTasks">) {
	const latestTurn = await ctx.db
		.query("agentTurns")
		.withIndex("by_task_id_and_sequence", (index) => index.eq("taskId", taskId))
		.order("desc")
		.first();
	return (latestTurn?.sequence ?? 0) + 1;
}

async function appendMemberMessage(
	ctx: MutationCtx,
	args: {
		turnId: Id<"agentTurns">;
		body: string;
		memberId: Id<"organizationMembers">;
		createdAt: number;
	},
) {
	return await ctx.db.insert("agentItems", {
		turnId: args.turnId,
		sequence: await nextItemSequence(ctx, args.turnId),
		createdAt: args.createdAt,
		kind: "member_message",
		body: args.body,
		memberId: args.memberId,
	});
}

async function insertQueuedRun(
	ctx: MutationCtx,
	args: {
		taskId: Id<"agentTasks">;
		turnId: Id<"agentTurns">;
		requestedAt: number;
	},
) {
	const runId = await ctx.db.insert("agentRuns", {
		turnId: args.turnId,
		status: "queued",
		requestedAt: args.requestedAt,
		attemptCount: 0,
		leaseFailureCount: 0,
		leaseGeneration: 0,
	});
	const task = await ctx.db.get(args.taskId);
	if (!task) throw new Error("Agent task disappeared while queuing its run");
	await resolveActiveAgentTaskLinks(ctx, task);
	if (task.activeRunIds.length >= MAX_ACTIVE_AGENT_RUNS) {
		throw invalidAgentTask("The task already has too many active runs.");
	}
	await ctx.db.patch("agentTasks", args.taskId, {
		activeRunIds: [...task.activeRunIds, runId],
	});
	await scheduleAgentRunPush(ctx, { runId, leaseGeneration: 0 });
	return runId;
}

async function insertTurnAndQueuedRun(
	ctx: MutationCtx,
	args: {
		taskId: Id<"agentTasks">;
		input?: string;
		requestedAt: number;
		requestedBy: RequestedBy;
		requestedByMemberId?: Id<"organizationMembers">;
	},
) {
	const turnId = await ctx.db.insert("agentTurns", {
		taskId: args.taskId,
		sequence: await getNextTurnSequence(ctx, args.taskId),
		requestedAt: args.requestedAt,
		requestedBy: args.requestedBy,
		...(args.requestedByMemberId
			? { requestedByMemberId: args.requestedByMemberId }
			: {}),
	});

	if (args.input !== undefined && args.requestedByMemberId) {
		await appendMemberMessage(ctx, {
			turnId,
			body: args.input,
			memberId: args.requestedByMemberId,
			createdAt: args.requestedAt,
		});
	} else if (args.input !== undefined) {
		await ctx.db.insert("agentItems", {
			turnId,
			sequence: 1,
			createdAt: args.requestedAt,
			kind: "system_message",
			body: args.input,
			source: args.requestedBy,
		});
	}

	const runId = await insertQueuedRun(ctx, {
		taskId: args.taskId,
		turnId,
		requestedAt: args.requestedAt,
	});
	return { runId, turnId };
}

async function requireAvailableCaseOwnership(
	ctx: MutationCtx,
	task: Doc<"agentTasks">,
) {
	if (task.ownershipReleasedAt === null) return;
	const activeOwner = await getActiveAgentTaskForCase(ctx, task.anchorCaseId);
	if (activeOwner && activeOwner._id !== task._id) {
		throw invalidAgentTask("This case already has another active agent task.");
	}
}

async function reactivateAgentTask(ctx: MutationCtx, task: Doc<"agentTasks">) {
	await ctx.db.replace("agentTasks", task._id, {
		...ownedAgentTaskFields(task),
		status: "active",
		activeRunIds: [],
		activeApprovalIds: [],
	});
}

export type InboundEmailAgentMessageBatch = Extract<
	Doc<"agentItems">,
	{ kind: "system_message" }
> & {
	runId: Id<"agentRuns">;
	inboundEmailMessageCount: number;
};

export function isInboundEmailAgentMessageBatch(
	item: Doc<"agentItems">,
): item is InboundEmailAgentMessageBatch {
	return (
		item.kind === "system_message" &&
		item.source === INBOUND_EMAIL_STEERING_SOURCE &&
		item.runId !== undefined &&
		item.inboundEmailMessageCount !== undefined
	);
}

async function getLatestRunForTurn(ctx: MutationCtx, turnId: Id<"agentTurns">) {
	return await ctx.db
		.query("agentRuns")
		.withIndex("by_turn_id_and_requested_at", (index) =>
			index.eq("turnId", turnId),
		)
		.order("desc")
		.first();
}

async function getApprovalSourceRuns(
	ctx: MutationCtx,
	approvals: ReadonlyArray<{ turnId: Id<"agentTurns"> }>,
) {
	const sourceRuns: Doc<"agentRuns">[] = [];
	const sourceTurnIds = new Set<Id<"agentTurns">>();
	for (const approval of approvals) {
		if (sourceTurnIds.has(approval.turnId)) continue;
		sourceTurnIds.add(approval.turnId);
		const sourceRun = await getLatestRunForTurn(ctx, approval.turnId);
		if (!sourceRun) {
			throw new Error("Agent approval has no source run");
		}
		sourceRuns.push(sourceRun);
	}
	return sourceRuns;
}

async function getUndeliveredInboundEmailMessageBatch(
	ctx: MutationCtx,
	sourceRun: Doc<"agentRuns">,
) {
	const items = await ctx.db
		.query("agentItems")
		.withIndex("by_run_id_and_kind_and_sequence", (index) =>
			index
				.eq("runId", sourceRun._id)
				.eq("kind", "system_message")
				.gt("sequence", sourceRun.lastSteeringSequence ?? 0),
		)
		.take(2);
	const batch = items[0];
	if (batch && !isInboundEmailAgentMessageBatch(batch)) {
		throw new Error("Agent run has an invalid inbound email batch");
	}
	if (items.length > 1) {
		throw new Error("Agent run has multiple pending inbound email batches");
	}
	return batch;
}

async function getUndeliveredInboundEmailMessageBatches(
	ctx: MutationCtx,
	sourceRuns: readonly Doc<"agentRuns">[],
) {
	const batches: InboundEmailAgentMessageBatch[] = [];
	for (const sourceRun of sourceRuns) {
		const batch = await getUndeliveredInboundEmailMessageBatch(ctx, sourceRun);
		if (batch) batches.push(batch);
	}
	return batches.sort(
		(left, right) =>
			left.createdAt - right.createdAt ||
			left._creationTime - right._creationTime,
	);
}

async function moveInboundEmailMessageBatches(
	ctx: MutationCtx,
	args: {
		batches: readonly InboundEmailAgentMessageBatch[];
		targetTurnId: Id<"agentTurns">;
		targetRunId: Id<"agentRuns">;
	},
) {
	if (args.batches.length === 0) return;
	let sequence = await nextItemSequence(ctx, args.targetTurnId);
	for (const batch of args.batches) {
		await ctx.db.patch(batch._id, {
			turnId: args.targetTurnId,
			runId: args.targetRunId,
			sequence,
		});
		sequence += 1;
	}
}

export async function positionUndeliveredInboundEmailBatchAtTurnEnd(
	ctx: MutationCtx,
	run: Doc<"agentRuns">,
) {
	const batch = await getUndeliveredInboundEmailMessageBatch(ctx, run);
	if (!batch) return null;
	const sequence = await nextItemSequence(ctx, run.turnId);
	if (sequence === batch.sequence + 1) return batch;
	await ctx.db.patch(batch._id, { sequence });
	return { ...batch, sequence };
}

async function recordInboundEmailForAgentRun(
	ctx: MutationCtx,
	args: {
		turnId: Id<"agentTurns">;
		run: Doc<"agentRuns">;
		threadId: Id<"emailThreads">;
		threadSubject: string;
		receivedAt: number;
	},
) {
	const pendingBatch = await getUndeliveredInboundEmailMessageBatch(
		ctx,
		args.run,
	);
	if (pendingBatch) {
		const staysInSingleThread = pendingBatch.emailThreadId === args.threadId;
		const messageCount = pendingBatch.inboundEmailMessageCount + 1;
		const threadSubject = staysInSingleThread ? args.threadSubject : undefined;
		await ctx.db.patch(pendingBatch._id, {
			createdAt: args.receivedAt,
			body: formatInboundEmailSteeringMessage({
				messageCount,
				...(threadSubject ? { threadSubject } : {}),
			}),
			inboundEmailMessageCount: messageCount,
			emailThreadId: staysInSingleThread ? args.threadId : undefined,
		});
		return pendingBatch._id;
	}

	return await ctx.db.insert("agentItems", {
		turnId: args.turnId,
		sequence: await nextItemSequence(ctx, args.turnId),
		createdAt: args.receivedAt,
		kind: "system_message",
		runId: args.run._id,
		body: formatInboundEmailSteeringMessage({
			messageCount: 1,
			threadSubject: args.threadSubject,
		}),
		source: INBOUND_EMAIL_STEERING_SOURCE,
		inboundEmailMessageCount: 1,
		emailThreadId: args.threadId,
	});
}

export async function notifyActiveAgentTaskOfInboundEmail(
	ctx: MutationCtx,
	args: {
		caseId: Id<"cases">;
		threadId: Id<"emailThreads">;
		threadSubject: string;
		receivedAt: number;
	},
) {
	const task = await getActiveAgentTaskForCase(ctx, args.caseId);
	if (!task) return null;

	if (task.status === "waiting") {
		await reactivateAgentTask(ctx, task);
		const continuation = await insertTurnAndQueuedRun(ctx, {
			taskId: task._id,
			requestedAt: args.receivedAt,
			requestedBy: INBOUND_EMAIL_STEERING_SOURCE,
		});
		const run = await ctx.db.get(continuation.runId);
		if (!run) throw new Error("Inbound email continuation run is missing");
		await recordInboundEmailForAgentRun(ctx, {
			turnId: continuation.turnId,
			run,
			threadId: args.threadId,
			threadSubject: args.threadSubject,
			receivedAt: args.receivedAt,
		});
		return { kind: "resumed" as const, ...continuation };
	}

	if (task.status === "waiting_for_approval") {
		const { approvals, runs } = await resolveActiveAgentTaskLinks(ctx, task);
		const run =
			runs.at(-1) ?? (await getApprovalSourceRuns(ctx, approvals)).at(-1);
		if (!run) throw new Error("Agent task approval has no source run");
		const turn = await ctx.db.get(run.turnId);
		if (!turn || turn.taskId !== task._id) {
			throw new Error("Agent approval source run belongs to another task");
		}
		await recordInboundEmailForAgentRun(ctx, {
			turnId: turn._id,
			run,
			threadId: args.threadId,
			threadSubject: args.threadSubject,
			receivedAt: args.receivedAt,
		});
		return {
			kind: "pending_approval" as const,
			turnId: turn._id,
			runId: run._id,
		};
	}

	if (task.status !== "active") return null;
	const { runs } = await resolveActiveAgentTaskLinks(ctx, task);
	const run = runs.at(-1);
	if (!run || (run.status !== "queued" && run.status !== "running")) {
		throw new Error("Active agent task has no current run");
	}
	const turn = await ctx.db.get(run.turnId);
	if (!turn || turn.taskId !== task._id) {
		throw new Error("Active agent run belongs to another task");
	}
	await recordInboundEmailForAgentRun(ctx, {
		turnId: turn._id,
		run,
		threadId: args.threadId,
		threadSubject: args.threadSubject,
		receivedAt: args.receivedAt,
	});
	return { kind: run.status, turnId: turn._id, runId: run._id };
}

export async function continueTaskFromUndeliveredInboundEmail(
	ctx: MutationCtx,
	args: {
		task: Doc<"agentTasks">;
		sourceRun: Doc<"agentRuns">;
	},
) {
	const batches = await getUndeliveredInboundEmailMessageBatches(ctx, [
		args.sourceRun,
	]);
	if (batches.length === 0) return null;
	if (
		args.task.status === "active" ||
		args.task.status === "waiting_for_approval" ||
		args.task.status === "cancelled"
	) {
		return null;
	}
	await requireAvailableCaseOwnership(ctx, args.task);
	await reactivateAgentTask(ctx, args.task);
	const continuation = await insertTurnAndQueuedRun(ctx, {
		taskId: args.task._id,
		requestedAt: Math.max(...batches.map((batch) => batch.createdAt)),
		requestedBy: INBOUND_EMAIL_STEERING_SOURCE,
	});
	await moveInboundEmailMessageBatches(ctx, {
		batches,
		targetTurnId: continuation.turnId,
		targetRunId: continuation.runId,
	});
	return continuation;
}

async function continueTaskWithMemberMessage(
	ctx: MutationCtx,
	args: {
		task: Doc<"agentTasks">;
		input: string;
		memberId: Id<"organizationMembers">;
		requestedAt: number;
	},
) {
	if (
		args.task.status === "active" ||
		args.task.status === "waiting_for_approval" ||
		args.task.status === "cancelled"
	) {
		throw invalidAgentTask("This task cannot start a new turn.");
	}
	await requireAvailableCaseOwnership(ctx, args.task);
	await reactivateAgentTask(ctx, args.task);
	return await insertTurnAndQueuedRun(ctx, {
		taskId: args.task._id,
		input: args.input,
		requestedAt: args.requestedAt,
		requestedBy: "member",
		requestedByMemberId: args.memberId,
	});
}

export async function cancelActiveTaskRuns(
	ctx: MutationCtx,
	args: {
		task: Doc<"agentTasks">;
		endedAt: number;
		reason: string;
	},
) {
	const { runs } = await resolveActiveAgentTaskLinks(ctx, args.task);
	for (const run of runs) {
		if (run.status !== "queued" && run.status !== "running") continue;
		await ctx.db.replace("agentRuns", run._id, {
			...agentRunBaseFields(run),
			status: "cancelled",
			endedAt: args.endedAt,
			reason: args.reason,
		});
	}
}

export async function addActiveApproval(
	ctx: MutationCtx,
	task: Doc<"agentTasks">,
	approvalItemId: Id<"agentItems">,
	activeRunIds: Id<"agentRuns">[],
) {
	await resolveActiveAgentTaskLinks(ctx, task);
	if (task.activeApprovalIds.length >= MAX_ACTIVE_AGENT_APPROVALS) {
		throw new ConvexError({
			code: "TOO_MANY_PENDING_APPROVALS",
			message: "Resolve the current approval requests before adding more.",
		});
	}
	await ctx.db.replace("agentTasks", task._id, {
		...ownedAgentTaskFields(task),
		status: "waiting_for_approval",
		activeRunIds,
		activeApprovalIds: [...task.activeApprovalIds, approvalItemId],
	});
}

type TerminalAgentTaskOutcome =
	| { status: "completed"; result: string }
	| { status: "unable_to_continue"; result: string }
	| { status: "failed"; error: string }
	| { status: "cancelled"; reason: string };

export async function terminalizeAgentTask(
	ctx: MutationCtx,
	args: {
		task: Doc<"agentTasks">;
		endedAt: number;
		outcome: TerminalAgentTaskOutcome;
	},
) {
	const cancellationReason =
		args.outcome.status === "completed"
			? args.outcome.result
			: args.outcome.status === "unable_to_continue"
				? `Unable to continue: ${args.outcome.result}`
				: args.outcome.status === "failed"
					? `Agent task failed: ${args.outcome.error}`
					: `Agent task cancelled: ${args.outcome.reason}`;
	await cancelActiveTaskRuns(ctx, {
		task: args.task,
		endedAt: args.endedAt,
		reason: cancellationReason,
	});
	await ctx.db.replace("agentTasks", args.task._id, {
		...terminalAgentTaskFields(args.task, args.endedAt),
		...args.outcome,
	});
}

export async function retireAssignedApprovalDecisions(
	ctx: MutationCtx,
	task: Doc<"agentTasks">,
	runId: Id<"agentRuns">,
	consumedAt: number,
) {
	const consumedIds = new Set<string>();
	for (const approval of await getActiveAgentTaskApprovals(ctx, task)) {
		if (
			approval.status === "pending" ||
			approval.continuationRunId !== runId ||
			approval.consumedAt !== undefined
		) {
			continue;
		}
		await ctx.db.patch(approval._id, { consumedAt });
		consumedIds.add(approval._id);
	}
	if (consumedIds.size === 0) return task;
	const activeApprovalIds = task.activeApprovalIds.filter(
		(approvalId) => !consumedIds.has(approvalId),
	);
	await ctx.db.patch(task._id, { activeApprovalIds });
	return { ...task, activeApprovalIds };
}

export async function queueApprovalContinuationIfReady(
	ctx: MutationCtx,
	args: {
		taskId: Id<"agentTasks">;
		requestedAt: number;
	},
) {
	const task = await ctx.db.get(args.taskId);
	if (
		!task ||
		task.status !== "waiting_for_approval" ||
		task.activeRunIds.length > 0 ||
		task.activeApprovalIds.length === 0
	) {
		return null;
	}
	const approvals = await getActiveAgentTaskApprovals(ctx, task);
	const decisions = approvals.filter(
		(approval) => approval.status !== "pending",
	);
	if (decisions.length !== approvals.length) return null;
	if (
		decisions.some(
			(approval) =>
				approval.continuationRunId !== undefined ||
				approval.consumedAt !== undefined,
		)
	) {
		return null;
	}
	const approvalSourceRuns = await getApprovalSourceRuns(ctx, approvals);
	const inboundEmailBatches = await getUndeliveredInboundEmailMessageBatches(
		ctx,
		approvalSourceRuns,
	);
	await ctx.db.replace("agentTasks", task._id, {
		...ownedAgentTaskFields(task),
		status: "active",
		activeRunIds: [],
	});
	const continuation = await insertTurnAndQueuedRun(ctx, {
		taskId: task._id,
		requestedAt: args.requestedAt,
		requestedBy: "system:approvalResolution",
	});
	await moveInboundEmailMessageBatches(ctx, {
		batches: inboundEmailBatches,
		targetTurnId: continuation.turnId,
		targetRunId: continuation.runId,
	});
	for (const approval of decisions) {
		await ctx.db.patch(approval._id, {
			continuationRunId: continuation.runId,
		});
	}
	console.info("agent_task_resumed_after_approval", {
		taskId: task._id,
		runId: continuation.runId,
		agentKey: task.agentKey,
		approvalCount: decisions.length,
	});
	return continuation;
}

export async function createAgentTask(
	ctx: MutationCtx,
	args: {
		anchorCase: Doc<"cases">;
		input: string;
		requestedAt: number;
		requestedBy: RequestedBy;
		requestedByMemberId?: Id<"organizationMembers">;
		agentKey?: string;
	},
) {
	const existingOwner = await getActiveAgentTaskForCase(
		ctx,
		args.anchorCase._id,
	);
	if (existingOwner) {
		throw invalidAgentTask("This case already has an active agent task.");
	}

	if (args.requestedBy === "member") {
		const member = args.requestedByMemberId
			? await ctx.db.get(args.requestedByMemberId)
			: null;
		if (
			!member ||
			member.organizationId !== args.anchorCase.organizationId ||
			!member.active
		) {
			throw invalidAgentTask("The requesting member is not active.");
		}
	} else if (args.requestedByMemberId) {
		throw invalidAgentTask(
			"Only a member request can include requestedByMemberId.",
		);
	}

	const input = requireTaskInput(args.input);
	const taskId = await ctx.db.insert("agentTasks", {
		organizationId: args.anchorCase.organizationId,
		anchorCaseId: args.anchorCase._id,
		agentKey: normalizeRuntimeIdentifier(args.agentKey ?? DEFAULT_AGENT_KEY),
		status: "active",
		requestedAt: args.requestedAt,
		requestedBy: args.requestedBy,
		...(args.requestedByMemberId
			? { requestedByMemberId: args.requestedByMemberId }
			: {}),
		ownershipReleasedAt: null,
		activeRunIds: [],
		activeApprovalIds: [],
	});
	const { runId, turnId } = await insertTurnAndQueuedRun(ctx, {
		taskId,
		input,
		requestedAt: args.requestedAt,
		requestedBy: args.requestedBy,
		requestedByMemberId: args.requestedByMemberId,
	});
	return { runId, taskId, turnId };
}

export const delegateCase = mutation({
	args: {
		caseId: v.id("cases"),
		input: v.string(),
	},
	returns: v.object({
		taskId: v.id("agentTasks"),
		turnId: v.id("agentTurns"),
		runId: v.id("agentRuns"),
	}),
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		const anchorCase = await requireCase(
			ctx,
			actor.organization._id,
			args.caseId,
		);
		return await createAgentTask(ctx, {
			anchorCase,
			input: args.input,
			requestedAt: Date.now(),
			requestedBy: "member",
			requestedByMemberId: actor.member._id,
		});
	},
});

export const retry = mutation({
	args: {
		taskId: v.id("agentTasks"),
	},
	returns: v.object({
		turnId: v.id("agentTurns"),
		runId: v.id("agentRuns"),
	}),
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		const { task } = await requireTaskInOrganization(
			ctx,
			args.taskId,
			actor.organization._id,
		);
		if (task.status !== "failed") {
			throw invalidAgentTask("Only a failed task can be retried.");
		}
		await requireAvailableCaseOwnership(ctx, task);
		const turn = await ctx.db
			.query("agentTurns")
			.withIndex("by_task_id_and_sequence", (index) =>
				index.eq("taskId", task._id),
			)
			.order("desc")
			.first();
		if (!turn) throw new Error("Failed agent task has no turn to retry");
		const sourceRun = await getLatestRunForTurn(ctx, turn._id);
		if (!sourceRun) throw new Error("Failed agent task has no run to retry");
		const inboundEmailBatches = await getUndeliveredInboundEmailMessageBatches(
			ctx,
			[sourceRun],
		);
		await reactivateAgentTask(ctx, task);
		const runId = await insertQueuedRun(ctx, {
			taskId: task._id,
			turnId: turn._id,
			requestedAt: Date.now(),
		});
		await moveInboundEmailMessageBatches(ctx, {
			batches: inboundEmailBatches,
			targetTurnId: turn._id,
			targetRunId: runId,
		});
		return { turnId: turn._id, runId };
	},
});

export const sendMessage = mutation({
	args: {
		taskId: v.id("agentTasks"),
		input: v.string(),
	},
	returns: v.union(
		v.object({
			kind: v.literal("steer"),
			turnId: v.id("agentTurns"),
			runId: v.id("agentRuns"),
		}),
		v.object({
			kind: v.literal("message"),
			turnId: v.id("agentTurns"),
			runId: v.id("agentRuns"),
		}),
	),
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		const { task } = await requireTaskInOrganization(
			ctx,
			args.taskId,
			actor.organization._id,
		);
		const input = requireTaskInput(args.input);
		const now = Date.now();

		if (task.status === "active") {
			const { runs } = await resolveActiveAgentTaskLinks(ctx, task);
			const run = runs.at(-1);
			if (!run || (run.status !== "queued" && run.status !== "running")) {
				throw new Error("Active agent task has no current run");
			}
			const turn = await ctx.db.get(run.turnId);
			if (!turn || turn.taskId !== task._id) {
				throw new Error("Active agent run belongs to another task");
			}

			if (run.status === "running") {
				if (run.selectedStatusItemId) {
					throw invalidAgentTask(
						"The agent is finishing this task. Try again shortly.",
					);
				}
				await ctx.db.insert("agentItems", {
					turnId: turn._id,
					sequence: await nextItemSequence(ctx, turn._id),
					createdAt: now,
					kind: "member_message_steer",
					runId: run._id,
					body: input,
					memberId: actor.member._id,
				});
				return { kind: "steer" as const, turnId: turn._id, runId: run._id };
			}

			await appendMemberMessage(ctx, {
				turnId: turn._id,
				body: input,
				memberId: actor.member._id,
				createdAt: now,
			});
			return { kind: "message" as const, turnId: turn._id, runId: run._id };
		}

		if (task.status === "waiting_for_approval") {
			throw invalidAgentTask(
				"Resolve the pending approvals before messaging the agent.",
			);
		}
		if (task.status === "cancelled") {
			throw invalidAgentTask("A cancelled task no longer accepts messages.");
		}
		const continuation = await continueTaskWithMemberMessage(ctx, {
			task,
			input,
			memberId: actor.member._id,
			requestedAt: now,
		});
		return { kind: "message" as const, ...continuation };
	},
});

export const answerApprovals = mutation({
	args: {
		taskId: v.id("agentTasks"),
		answers: v.array(
			v.object({
				approvalId: v.string(),
				approved: v.boolean(),
			}),
		),
	},
	returns: v.union(
		v.object({ resumed: v.literal(false) }),
		v.object({
			resumed: v.literal(true),
			turnId: v.id("agentTurns"),
			runId: v.id("agentRuns"),
		}),
	),
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		const { task } = await requireTaskInOrganization(
			ctx,
			args.taskId,
			actor.organization._id,
		);
		if (task.status !== "waiting_for_approval") {
			throw invalidAgentTask("This task is not waiting for approval.");
		}
		if (args.answers.length < 1 || args.answers.length > MAX_APPROVAL_ANSWERS) {
			throw invalidAgentTask(
				`Answer 1 to ${MAX_APPROVAL_ANSWERS} approvals at a time.`,
			);
		}

		const answers = args.answers
			.map((answer) => ({
				...answer,
				approvalId: normalizeRuntimeIdentifier(answer.approvalId),
			}))
			.sort((left, right) => left.approvalId.localeCompare(right.approvalId));
		if (
			new Set(answers.map((answer) => answer.approvalId)).size !==
			answers.length
		) {
			throw invalidAgentTask("Each approval can only be answered once.");
		}

		const activeApprovalIds = new Set(
			task.activeApprovalIds.map((approvalId) => approvalId.toString()),
		);
		const approvals = await Promise.all(
			answers.map(async (answer) => {
				const approval = await ctx.db
					.query("agentItems")
					.withIndex("by_approval_id", (index) =>
						index.eq("approvalId", answer.approvalId),
					)
					.unique();
				if (
					!approval ||
					approval.kind !== "approval" ||
					approval.status !== "pending" ||
					!activeApprovalIds.has(approval._id.toString())
				) {
					throw invalidAgentTask("The approval request is no longer pending.");
				}
				const approvalTurn = await ctx.db.get(approval.turnId);
				if (!approvalTurn || approvalTurn.taskId !== task._id) {
					throw invalidAgentTask(
						"The approval request belongs to another task.",
					);
				}
				return { answer, approval };
			}),
		);

		const answeredAt = Date.now();
		for (const { answer, approval } of approvals) {
			await ctx.db.patch(approval._id, {
				status: answer.approved ? ("approved" as const) : ("denied" as const),
				answeredByMemberId: actor.member._id,
				answeredAt,
			});
		}

		if (
			(await getActiveAgentTaskApprovals(ctx, task)).some(
				(approval) => approval.status === "pending",
			) ||
			task.activeRunIds.length > 0
		) {
			return { resumed: false as const };
		}

		const resumed = await queueApprovalContinuationIfReady(ctx, {
			taskId: task._id,
			requestedAt: answeredAt,
		});
		if (!resumed) return { resumed: false as const };
		return { resumed: true as const, ...resumed };
	},
});

export const takeOverCase = mutation({
	args: {
		caseId: v.id("cases"),
		reason: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		await requireCase(ctx, actor.organization._id, args.caseId);
		const task = await getActiveAgentTaskForCase(ctx, args.caseId);
		if (!task) return null;
		if (task.organizationId !== actor.organization._id) {
			throw new Error("Agent task has an invalid organization partition");
		}

		const now = Date.now();
		const reason =
			normalizeTakeoverReason(args.reason) ?? "A member took over the case.";
		for (const approval of await getActiveAgentTaskApprovals(ctx, task)) {
			if (approval.status !== "pending") continue;
			await ctx.db.patch(approval._id, {
				status: "denied" as const,
				answeredByMemberId: actor.member._id,
				answeredAt: now,
			});
		}
		await terminalizeAgentTask(ctx, {
			task,
			endedAt: now,
			outcome: { status: "cancelled", reason },
		});
		return null;
	},
});
