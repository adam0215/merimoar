import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import {
	requireAgentRuntimeSecret,
	requireClaimedAgentRun,
} from "#/agent/access";
import { EMAIL_TOOL_KEY, isBuiltInToolActive } from "#/agent/builtInTools";
import {
	agentRunBaseFields,
	agentRunUsageValidator,
	agentTaskStatusUpdateValidator,
} from "#/agent/model";
import { finalizeClaimedRun } from "#/agent/runFinalization";
import {
	nextItemSequence,
	normalizeClaimToken,
	normalizeRuntimeIdentifier,
	normalizeTaskStatusUpdate,
	requireProductText,
	requireRunToolItem,
	taskStatusUpdatesEqual,
} from "#/agent/runtimeValues";
import {
	addActiveApproval,
	cancelActiveTaskRuns,
	queueApprovalContinuationIfReady,
	retireAssignedApprovalDecisions,
	terminalizeAgentTask,
} from "#/agent/tasks";
import {
	projectTranscriptItem,
	runtimeTranscriptPageValidator,
	transcriptItemPageValidator,
} from "#/agent/transcript";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";

const MIN_LEASE_DURATION_MS = 5_000;
const MAX_LEASE_DURATION_MS = 5 * 60_000;
const MAX_CLAIM_CANDIDATES = 20;
const MAX_ACTIVITY_TITLE_LENGTH = 200;
const MAX_ACTIVITY_DETAIL_LENGTH = 2_000;
const MAX_STEERING_MESSAGES_PER_STEP = 20;

async function findClaimableRun(ctx: MutationCtx, now: number) {
	const queuedRuns = await ctx.db
		.query("agentRuns")
		.withIndex("by_status_and_requested_at", (index) =>
			index.eq("status", "queued"),
		)
		.take(MAX_CLAIM_CANDIDATES);
	for (const run of queuedRuns) {
		const owner = await getCurrentActiveTaskForRun(ctx, run);
		if (!owner) {
			await cancelUnclaimableRun(ctx, run, now);
			continue;
		}
		return { run, ...owner };
	}
	return null;
}

async function getCurrentActiveTaskForRun(
	ctx: MutationCtx,
	run: Doc<"agentRuns">,
) {
	const turn = await ctx.db.get(run.turnId);
	const task = turn ? await ctx.db.get(turn.taskId) : null;
	if (
		!turn ||
		task?.status !== "active" ||
		task.activeRunIds.at(-1) !== run._id
	) {
		return null;
	}
	return { task, turn };
}

async function cancelUnclaimableRun(
	ctx: MutationCtx,
	run: Doc<"agentRuns">,
	now: number,
) {
	await ctx.db.replace("agentRuns", run._id, {
		...agentRunBaseFields(run),
		status: "cancelled",
		endedAt: now,
		reason: "The task ended before this run could continue.",
	});
}

export const observeNextQueuedRun = query({
	args: {
		runtimeSecret: v.string(),
	},
	returns: v.union(v.id("agentRuns"), v.null()),
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		const run = await ctx.db
			.query("agentRuns")
			.withIndex("by_status_and_requested_at", (index) =>
				index.eq("status", "queued"),
			)
			.first();
		return run?._id ?? null;
	},
});

export const claimNextRun = mutation({
	args: {
		runtimeSecret: v.string(),
		claimToken: v.string(),
		leaseDurationMs: v.number(),
	},
	returns: v.union(
		v.object({
			runId: v.id("agentRuns"),
			turnId: v.id("agentTurns"),
			taskId: v.id("agentTasks"),
			anchorCaseId: v.id("cases"),
			agentKey: v.string(),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		normalizeClaimToken(args.claimToken);
		if (
			!Number.isInteger(args.leaseDurationMs) ||
			args.leaseDurationMs < MIN_LEASE_DURATION_MS ||
			args.leaseDurationMs > MAX_LEASE_DURATION_MS
		) {
			throw new Error("Invalid agent run lease duration");
		}

		const now = Date.now();
		const candidate = await findClaimableRun(ctx, now);
		if (!candidate) return null;

		const leaseExpiresAt = now + args.leaseDurationMs;
		const leaseGeneration = candidate.run.leaseGeneration + 1;
		const attempt = candidate.run.attemptCount + 1;
		await ctx.db.replace("agentRuns", candidate.run._id, {
			...agentRunBaseFields(candidate.run),
			attemptCount: attempt,
			leaseGeneration,
			status: "running",
			claimToken: args.claimToken,
			claimedAt: now,
			leaseExpiresAt,
			startedAt: now,
		});
		await ctx.scheduler.runAt(
			leaseExpiresAt,
			internal.agent.leases.requeueExpiredRun,
			{
				runId: candidate.run._id,
				leaseGeneration,
			},
		);
		console.info("agent_run_claimed", {
			runId: candidate.run._id,
			taskId: candidate.task._id,
			agentKey: candidate.task.agentKey,
			attempt,
		});
		return {
			runId: candidate.run._id,
			turnId: candidate.turn._id,
			taskId: candidate.task._id,
			anchorCaseId: candidate.task.anchorCaseId,
			agentKey: candidate.task.agentKey,
		};
	},
});

export const renewRunLease = mutation({
	args: {
		runtimeSecret: v.string(),
		runId: v.id("agentRuns"),
		claimToken: v.string(),
		leaseDurationMs: v.number(),
	},
	returns: v.number(),
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		if (
			!Number.isInteger(args.leaseDurationMs) ||
			args.leaseDurationMs < MIN_LEASE_DURATION_MS ||
			args.leaseDurationMs > MAX_LEASE_DURATION_MS
		) {
			throw new Error("Invalid agent run lease duration");
		}
		const { run } = await requireClaimedAgentRun(
			ctx,
			{
				...args,
			},
			"current_run",
		);
		const leaseExpiresAt = Date.now() + args.leaseDurationMs;
		const leaseGeneration = run.leaseGeneration + 1;
		await ctx.db.replace("agentRuns", run._id, {
			...agentRunBaseFields(run),
			leaseGeneration,
			status: "running",
			claimToken: run.claimToken,
			claimedAt: run.claimedAt,
			leaseExpiresAt,
			startedAt: run.startedAt,
		});
		await ctx.scheduler.runAt(
			leaseExpiresAt,
			internal.agent.leases.requeueExpiredRun,
			{
				runId: run._id,
				leaseGeneration,
			},
		);
		return leaseExpiresAt;
	},
});

export const relinquishRun = mutation({
	args: {
		runtimeSecret: v.string(),
		runId: v.id("agentRuns"),
		claimToken: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		const existingRun = await ctx.db.get(args.runId);
		if (!existingRun || existingRun.status !== "running") return null;

		const { isCurrentTurn, run, task } = await requireClaimedAgentRun(
			ctx,
			args,
			"claimed_run",
		);
		if (task.status === "active" && isCurrentTurn) {
			await ctx.db.replace("agentRuns", run._id, {
				...agentRunBaseFields(run),
				status: "queued",
			});
			return null;
		}

		const now = Date.now();
		await ctx.db.replace("agentRuns", run._id, {
			...agentRunBaseFields(run),
			status: "cancelled",
			endedAt: now,
			reason: "The worker relinquished a run that no longer owned active work.",
		});
		if (
			task.status === "waiting_for_approval" &&
			task.activeRunIds.includes(run._id)
		) {
			const taskAfterApprovalReplay = await retireAssignedApprovalDecisions(
				ctx,
				task,
				run._id,
				now,
			);
			await ctx.db.patch(taskAfterApprovalReplay._id, {
				activeRunIds: taskAfterApprovalReplay.activeRunIds.filter(
					(runId) => runId !== run._id,
				),
			});
			if (taskAfterApprovalReplay.activeApprovalIds.length > 0) {
				await queueApprovalContinuationIfReady(ctx, {
					taskId: taskAfterApprovalReplay._id,
					requestedAt: now,
				});
			}
		}
		return null;
	},
});

export const getTranscript = mutation({
	args: {
		runtimeSecret: v.string(),
		runId: v.id("agentRuns"),
		claimToken: v.string(),
		paginationOpts: paginationOptsValidator,
	},
	returns: runtimeTranscriptPageValidator,
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		const { run, task } = await requireClaimedAgentRun(
			ctx,
			args,
			"current_run",
		);
		const turns = await ctx.db
			.query("agentTurns")
			.withIndex("by_task_id_and_sequence", (index) =>
				index.eq("taskId", task._id),
			)
			.order("asc")
			.paginate(args.paginationOpts);
		return {
			taskId: task._id,
			...(run.selectedStatusItemId
				? { selectedStatusItemId: run.selectedStatusItemId }
				: {}),
			turns: {
				...turns,
				page: turns.page.map((turn) => ({
					turnId: turn._id,
					sequence: turn.sequence,
				})),
			},
		};
	},
});

export const getTranscriptItems = mutation({
	args: {
		runtimeSecret: v.string(),
		runId: v.id("agentRuns"),
		claimToken: v.string(),
		turnId: v.id("agentTurns"),
		paginationOpts: paginationOptsValidator,
	},
	returns: transcriptItemPageValidator,
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		const { task } = await requireClaimedAgentRun(ctx, args, "current_run");
		const turn = await ctx.db.get(args.turnId);
		if (!turn || turn.taskId !== task._id) {
			throw new ConvexError(
				"Transcript turn does not belong to the claimed task",
			);
		}
		const items = await ctx.db
			.query("agentItems")
			.withIndex("by_turn_id_and_sequence", (index) =>
				index.eq("turnId", turn._id),
			)
			.order("asc")
			.paginate(args.paginationOpts);
		return {
			...items,
			page: items.page.map(projectTranscriptItem),
		};
	},
});

export const getSteeringMessages = mutation({
	args: {
		runtimeSecret: v.string(),
		runId: v.id("agentRuns"),
		claimToken: v.string(),
		afterSequence: v.number(),
	},
	returns: v.array(
		v.object({
			body: v.string(),
			sequence: v.number(),
		}),
	),
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		if (!Number.isInteger(args.afterSequence) || args.afterSequence < 0) {
			throw new Error("Invalid steering sequence");
		}
		const { turn } = await requireClaimedAgentRun(ctx, args, "writable_run");
		const items = await ctx.db
			.query("agentItems")
			.withIndex("by_run_id_and_kind_and_sequence", (index) =>
				index
					.eq("runId", args.runId)
					.eq("kind", "member_message_steer")
					.gt("sequence", args.afterSequence),
			)
			.take(MAX_STEERING_MESSAGES_PER_STEP);
		return items.map((item) => {
			if (item.kind !== "member_message_steer" || item.turnId !== turn._id) {
				throw new Error("Agent steering index returned an invalid item");
			}
			return { body: item.body, sequence: item.sequence };
		});
	},
});

export const updateActivity = mutation({
	args: {
		runtimeSecret: v.string(),
		runId: v.id("agentRuns"),
		claimToken: v.string(),
		title: v.string(),
		detail: v.optional(v.string()),
	},
	returns: v.id("agentItems"),
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		const { turn } = await requireClaimedAgentRun(
			ctx,
			{
				...args,
			},
			"writable_run",
		);
		return await ctx.db.insert("agentItems", {
			turnId: turn._id,
			sequence: await nextItemSequence(ctx, turn._id),
			createdAt: Date.now(),
			kind: "activity",
			runId: args.runId,
			title: requireProductText(
				args.title,
				"Activity title",
				MAX_ACTIVITY_TITLE_LENGTH,
			),
			...(args.detail
				? {
						detail: requireProductText(
							args.detail,
							"Activity detail",
							MAX_ACTIVITY_DETAIL_LENGTH,
						),
					}
				: {}),
		});
	},
});

export const startAgentMessage = mutation({
	args: {
		runtimeSecret: v.string(),
		runId: v.id("agentRuns"),
		claimToken: v.string(),
		body: v.string(),
	},
	returns: v.id("agentItems"),
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		const { turn } = await requireClaimedAgentRun(
			ctx,
			{
				...args,
			},
			"writable_run",
		);
		return await ctx.db.insert("agentItems", {
			turnId: turn._id,
			sequence: await nextItemSequence(ctx, turn._id),
			createdAt: Date.now(),
			kind: "agent_message",
			runId: args.runId,
			body: requireProductText(args.body, "Agent message text"),
		});
	},
});

export const updateAgentMessage = mutation({
	args: {
		runtimeSecret: v.string(),
		runId: v.id("agentRuns"),
		claimToken: v.string(),
		itemId: v.id("agentItems"),
		body: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		const { turn } = await requireClaimedAgentRun(
			ctx,
			{
				...args,
			},
			"writable_run",
		);
		const item = await ctx.db.get(args.itemId);
		if (
			!item ||
			item.kind !== "agent_message" ||
			item.turnId !== turn._id ||
			item.runId !== args.runId
		) {
			throw new Error("Agent message item not found");
		}
		await ctx.db.replace("agentItems", item._id, {
			turnId: item.turnId,
			sequence: item.sequence,
			createdAt: item.createdAt,
			kind: "agent_message",
			runId: item.runId,
			body: requireProductText(args.body, "Agent message text"),
		});
		return null;
	},
});

export const recordToolStarted = mutation({
	args: {
		runtimeSecret: v.string(),
		runId: v.id("agentRuns"),
		claimToken: v.string(),
		toolCallId: v.string(),
		toolName: v.string(),
		customToolId: v.optional(v.id("agentCustomTools")),
		inputJson: v.string(),
		summary: v.string(),
	},
	returns: v.id("agentItems"),
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		const { run, task, turn } = await requireClaimedAgentRun(
			ctx,
			{
				...args,
			},
			"current_run",
		);
		if (task.status !== "active" && task.status !== "waiting_for_approval") {
			throw new ConvexError({
				code: "AGENT_TASK_NOT_ACTIVE",
				message: "The task is no longer accepting tool calls.",
			});
		}
		const toolCallId = normalizeRuntimeIdentifier(
			args.toolCallId,
			"Tool call ID",
		);
		const toolName = normalizeRuntimeIdentifier(args.toolName, "Tool name");
		const inputJson = args.inputJson;
		const summary = requireProductText(args.summary, "Tool summary");
		const existing = await ctx.db
			.query("agentItems")
			.withIndex("by_run_id_and_tool_call_id", (index) =>
				index.eq("runId", args.runId).eq("toolCallId", toolCallId),
			)
			.unique();
		if (existing) {
			if (
				existing.kind !== "tool" ||
				existing.turnId !== turn._id ||
				existing.toolName !== toolName ||
				existing.customToolId !== args.customToolId ||
				existing.inputJson !== inputJson ||
				existing.summary !== summary
			) {
				throw new Error("Invalid tool item");
			}
			return existing._id;
		}
		if (run.selectedStatusItemId) {
			throw new ConvexError({
				code: "AGENT_STATUS_ALREADY_SELECTED",
				message:
					"The run already selected its task status and can only be finalized.",
			});
		}
		return await ctx.db.insert("agentItems", {
			turnId: turn._id,
			sequence: await nextItemSequence(ctx, turn._id),
			createdAt: Date.now(),
			kind: "tool",
			runId: args.runId,
			toolCallId,
			toolName,
			...(args.customToolId ? { customToolId: args.customToolId } : {}),
			inputJson,
			summary,
			status: "started",
		});
	},
});

export const recordToolFinished = mutation({
	args: {
		runtimeSecret: v.string(),
		runId: v.id("agentRuns"),
		claimToken: v.string(),
		toolCallId: v.string(),
		result: v.union(
			v.object({
				status: v.literal("completed"),
				outputJson: v.string(),
				durationMs: v.optional(v.number()),
			}),
			v.object({
				status: v.literal("failed"),
				error: v.string(),
				durationMs: v.optional(v.number()),
			}),
		),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		const { turn } = await requireClaimedAgentRun(
			ctx,
			{
				...args,
			},
			"current_run",
		);
		const item = await requireRunToolItem(ctx, {
			runId: args.runId,
			turnId: turn._id,
			toolCallId: args.toolCallId,
		});
		if (item.status === "completed") return null;
		if (item.status === "approval_required") {
			throw new ConvexError({
				code: "INVALID_AGENT_RUNTIME_INPUT",
				message: "A tool awaiting approval cannot be completed directly.",
			});
		}
		const base = {
			turnId: item.turnId,
			sequence: item.sequence,
			createdAt: item.createdAt,
			kind: "tool" as const,
			runId: item.runId,
			toolCallId: item.toolCallId,
			toolName: item.toolName,
			...(item.customToolId ? { customToolId: item.customToolId } : {}),
			inputJson: item.inputJson,
			summary: item.summary,
		};
		await ctx.db.replace(
			"agentItems",
			item._id,
			args.result.status === "completed"
				? {
						...base,
						status: "completed",
						outputJson: args.result.outputJson,
						...(args.result.durationMs === undefined
							? {}
							: { durationMs: args.result.durationMs }),
					}
				: {
						...base,
						status: "failed",
						error: requireProductText(args.result.error, "Tool error"),
						...(args.result.durationMs === undefined
							? {}
							: { durationMs: args.result.durationMs }),
					},
		);
		return null;
	},
});

export const recordToolApprovalRequest = mutation({
	args: {
		runtimeSecret: v.string(),
		runId: v.id("agentRuns"),
		claimToken: v.string(),
		toolCallId: v.string(),
		approvalId: v.string(),
		request: v.string(),
		signature: v.optional(v.string()),
	},
	returns: v.id("agentItems"),
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		const { task, turn } = await requireClaimedAgentRun(
			ctx,
			{
				...args,
			},
			"writable_run",
		);
		if (task.status !== "active" && task.status !== "waiting_for_approval") {
			throw new ConvexError({
				code: "AGENT_TASK_NOT_ACTIVE",
				message: "The task is no longer accepting approval requests.",
			});
		}
		const toolCallId = normalizeRuntimeIdentifier(
			args.toolCallId,
			"Tool call ID",
		);
		const approvalId = normalizeRuntimeIdentifier(
			args.approvalId,
			"Approval ID",
		);
		const toolItem = await requireRunToolItem(ctx, {
			runId: args.runId,
			turnId: turn._id,
			toolCallId,
		});
		if (toolItem.status !== "started") {
			throw new ConvexError({
				code: "INVALID_AGENT_RUNTIME_INPUT",
				message: "Only a started tool call can request approval.",
			});
		}
		const existingApproval = await ctx.db
			.query("agentItems")
			.withIndex("by_approval_id", (index) =>
				index.eq("approvalId", approvalId),
			)
			.unique();
		if (existingApproval) throw new Error("Approval ID already exists");
		const createdAt = Date.now();
		const emailToolDisabled =
			toolItem.toolName === EMAIL_TOOL_KEY &&
			!(await isBuiltInToolActive(ctx, task.organizationId, EMAIL_TOOL_KEY));

		await ctx.db.replace("agentItems", toolItem._id, {
			turnId: toolItem.turnId,
			sequence: toolItem.sequence,
			createdAt: toolItem.createdAt,
			kind: "tool",
			runId: toolItem.runId,
			toolCallId: toolItem.toolCallId,
			toolName: toolItem.toolName,
			...(toolItem.customToolId ? { customToolId: toolItem.customToolId } : {}),
			inputJson: toolItem.inputJson,
			summary: toolItem.summary,
			status: "approval_required",
		});
		const approvalItemId = await ctx.db.insert("agentItems", {
			turnId: turn._id,
			sequence: await nextItemSequence(ctx, turn._id),
			createdAt,
			kind: "approval",
			approvalKind: "tool",
			toolItemId: toolItem._id,
			approvalId,
			request: requireProductText(args.request, "Approval request"),
			...(emailToolDisabled
				? {
						status: "invalidated" as const,
						invalidatedAt: createdAt,
						invalidationCause: {
							kind: "email_tool_disabled" as const,
						},
					}
				: { status: "pending" as const }),
			...(args.signature ? { signature: args.signature } : {}),
		});
		await addActiveApproval(ctx, task, approvalItemId, task.activeRunIds);
		if (task.status !== "waiting_for_approval") {
			console.info("agent_task_waiting_for_approval", {
				taskId: task._id,
				runId: args.runId,
				agentKey: task.agentKey,
				approvalKind: "tool",
			});
		}
		return approvalItemId;
	},
});

export const stageTaskStatus = mutation({
	args: {
		runtimeSecret: v.string(),
		runId: v.id("agentRuns"),
		claimToken: v.string(),
		toolCallId: v.string(),
		update: agentTaskStatusUpdateValidator,
	},
	returns: agentTaskStatusUpdateValidator,
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		const { run, task, turn } = await requireClaimedAgentRun(
			ctx,
			args,
			"current_run",
		);
		if (task.status !== "active") {
			throw new ConvexError({
				code: "AGENT_TASK_NOT_ACTIVE",
				message: "Only an active task can select a task status.",
			});
		}
		const item = await requireRunToolItem(ctx, {
			runId: args.runId,
			turnId: turn._id,
			toolCallId: args.toolCallId,
		});
		if (item.toolName !== "update_task_status") {
			throw new ConvexError({
				code: "INVALID_AGENT_RUNTIME_INPUT",
				message: "The task status tool was not durably started.",
			});
		}
		const update = normalizeTaskStatusUpdate(args.update);
		if (run.selectedStatusItemId) {
			if (run.selectedStatusItemId !== item._id) {
				throw new ConvexError({
					code: "AGENT_STATUS_ALREADY_SELECTED",
					message:
						"Another tool call already selected the task status for this run.",
				});
			}
			if (item.status !== "completed") {
				throw new Error("Selected task status item is incomplete");
			}
			if (
				!("taskStatusUpdate" in item) ||
				!taskStatusUpdatesEqual(item.taskStatusUpdate, update)
			) {
				throw new ConvexError({
					code: "AGENT_STATUS_ALREADY_SELECTED",
					message: "This tool call already selected a different task status.",
				});
			}
			return update;
		}
		if (item.status === "completed") {
			throw new Error("Completed task status item is not selected by its run");
		}
		if (item.status !== "started") {
			throw new ConvexError({
				code: "INVALID_AGENT_RUNTIME_INPUT",
				message: "Only a started tool call can select the task status.",
			});
		}
		await ctx.db.replace("agentItems", item._id, {
			turnId: item.turnId,
			sequence: item.sequence,
			createdAt: item.createdAt,
			kind: "tool",
			runId: item.runId,
			toolCallId: item.toolCallId,
			toolName: item.toolName,
			...(item.customToolId ? { customToolId: item.customToolId } : {}),
			inputJson: item.inputJson,
			summary: item.summary,
			status: "completed",
			taskStatusUpdate: update,
		});
		await ctx.db.patch(run._id, { selectedStatusItemId: item._id });
		return update;
	},
});

export const finishRun = mutation({
	args: {
		runtimeSecret: v.string(),
		runId: v.id("agentRuns"),
		claimToken: v.string(),
		usage: v.optional(agentRunUsageValidator),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		const { isCurrentTurn, run, task, turn } = await requireClaimedAgentRun(
			ctx,
			{
				...args,
			},
			"claimed_run",
		);
		await finalizeClaimedRun(ctx, {
			isCurrentTurn,
			run,
			task,
			turn,
			usage: args.usage,
		});
		return null;
	},
});

export const failRun = mutation({
	args: {
		runtimeSecret: v.string(),
		runId: v.id("agentRuns"),
		claimToken: v.string(),
		message: v.string(),
		debug: v.optional(v.string()),
	},
	returns: v.union(v.literal("failed"), v.literal("finalized_selected_status")),
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		const { isCurrentTurn, run, task, turn } = await requireClaimedAgentRun(
			ctx,
			{
				...args,
			},
			"claimed_run",
		);
		if (run.selectedStatusItemId) {
			await finalizeClaimedRun(ctx, {
				isCurrentTurn,
				run,
				task,
				turn,
			});
			return "finalized_selected_status";
		}
		const now = Date.now();
		const message = requireProductText(args.message, "Error");
		await ctx.db.insert("agentItems", {
			turnId: turn._id,
			sequence: await nextItemSequence(ctx, turn._id),
			createdAt: now,
			kind: "error",
			runId: run._id,
			message,
			...(args.debug ? { debug: args.debug } : {}),
		});
		await ctx.db.replace("agentRuns", run._id, {
			...agentRunBaseFields(run),
			status: "failed",
			endedAt: now,
			error: message,
		});
		const taskAfterApprovalReplay = await retireAssignedApprovalDecisions(
			ctx,
			task,
			run._id,
			now,
		);
		if (taskAfterApprovalReplay.status === "active" && isCurrentTurn) {
			await terminalizeAgentTask(ctx, {
				task: taskAfterApprovalReplay,
				endedAt: now,
				outcome: { status: "failed", error: message },
			});
		} else if (
			taskAfterApprovalReplay.status === "waiting_for_approval" &&
			taskAfterApprovalReplay.activeRunIds.includes(run._id)
		) {
			await cancelActiveTaskRuns(ctx, {
				task: taskAfterApprovalReplay,
				endedAt: now,
				reason: "The source run failed.",
			});
			await ctx.db.patch("agentTasks", taskAfterApprovalReplay._id, {
				activeRunIds: [],
			});
			if (taskAfterApprovalReplay.activeApprovalIds.length > 0) {
				await queueApprovalContinuationIfReady(ctx, {
					taskId: taskAfterApprovalReplay._id,
					requestedAt: now,
				});
			}
		}
		const currentTask = await ctx.db.get(taskAfterApprovalReplay._id);
		console.error("agent_run_finished", {
			runId: run._id,
			taskId: task._id,
			agentKey: task.agentKey,
			runStatus: "failed",
			taskStatus: currentTask?.status ?? taskAfterApprovalReplay.status,
		});
		return "failed";
	},
});
