import { ConvexError } from "convex/values";
import {
	type AgentTaskStatusUpdate,
	agentRunBaseFields,
	ownedAgentTaskFields,
} from "#/agent/model";
import {
	nextItemSequence,
	normalizeTaskStatusUpdate,
} from "#/agent/runtimeValues";
import {
	addActiveApproval,
	cancelActiveTaskRuns,
	continueTaskFromUndeliveredInboundEmail,
	queueApprovalContinuationIfReady,
	retireAssignedApprovalDecisions,
	terminalizeAgentTask,
} from "#/agent/tasks";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

async function getSelectedTaskStatus(
	ctx: MutationCtx,
	run: Extract<Doc<"agentRuns">, { status: "running" }>,
) {
	if (!run.selectedStatusItemId) return undefined;
	const item = await ctx.db.get(run.selectedStatusItemId);
	if (
		!item ||
		item.kind !== "tool" ||
		item.runId !== run._id ||
		item.turnId !== run.turnId ||
		item.toolName !== "update_task_status" ||
		item.status !== "completed"
	) {
		throw new Error("Selected task status item is invalid");
	}
	if (!("taskStatusUpdate" in item)) {
		throw new Error("Selected task status item is missing its durable update");
	}
	return item.taskStatusUpdate;
}

export async function finalizeClaimedRun(
	ctx: MutationCtx,
	args: {
		isCurrentTurn: boolean;
		run: Extract<Doc<"agentRuns">, { status: "running" }>;
		task: Doc<"agentTasks">;
		turn: Doc<"agentTurns">;
		usage?: {
			inputTokens?: number;
			outputTokens?: number;
			totalTokens?: number;
		};
	},
) {
	const update = await getSelectedTaskStatus(ctx, args.run);
	if (update && (args.task.status !== "active" || !args.isCurrentTurn)) {
		throw new ConvexError({
			code: "AGENT_TASK_NOT_ACTIVE",
			message: "Only the current active run can choose the task status.",
		});
	}
	if (!update && args.task.status === "active" && args.isCurrentTurn) {
		throw new ConvexError({
			code: "AGENT_STATUS_REQUIRED",
			message: "The agent must update the task status before finishing.",
		});
	}
	const now = Date.now();
	await ctx.db.replace("agentRuns", args.run._id, {
		...agentRunBaseFields(args.run),
		status: "completed",
		endedAt: now,
		...(args.usage ? { usage: args.usage } : {}),
	});
	const taskAfterApprovalReplay = await retireAssignedApprovalDecisions(
		ctx,
		args.task,
		args.run._id,
		now,
	);
	const sourceOwnsActiveTaskState =
		args.isCurrentTurn ||
		(taskAfterApprovalReplay.status === "waiting_for_approval" &&
			taskAfterApprovalReplay.activeRunIds.includes(args.run._id));
	const statusTransitionCancelsRuns =
		!update ||
		update.status === "waiting" ||
		update.status === "waiting_for_approval";
	if (sourceOwnsActiveTaskState && statusTransitionCancelsRuns) {
		await cancelActiveTaskRuns(ctx, {
			task: taskAfterApprovalReplay,
			endedAt: now,
			reason: "The source run ended before another active run could continue.",
		});
	}
	if (!update && sourceOwnsActiveTaskState) {
		await ctx.db.patch("agentTasks", taskAfterApprovalReplay._id, {
			activeRunIds: [],
		});
	}
	if (update) {
		await applyTaskStatusUpdate(ctx, {
			task: taskAfterApprovalReplay,
			turn: args.turn,
			update,
			now,
		});
	}
	if (update && update.status !== "waiting_for_approval") {
		const taskAfterStatusUpdate = await ctx.db.get(args.task._id);
		if (taskAfterStatusUpdate) {
			await continueTaskFromUndeliveredInboundEmail(ctx, {
				task: taskAfterStatusUpdate,
				sourceRun: args.run,
			});
		}
	}
	if (update?.status === "waiting_for_approval") {
		console.info("agent_task_waiting_for_approval", {
			taskId: args.task._id,
			runId: args.run._id,
			agentKey: args.task.agentKey,
			approvalKind: "task",
		});
	}
	const currentTask = await ctx.db.get(taskAfterApprovalReplay._id);
	console.info("agent_run_finished", {
		runId: args.run._id,
		taskId: args.task._id,
		agentKey: args.task.agentKey,
		runStatus: "completed",
		taskStatus: update?.status ?? currentTask?.status ?? args.task.status,
	});
	if (
		currentTask?.status === "waiting_for_approval" &&
		currentTask.activeApprovalIds.length > 0
	) {
		await queueApprovalContinuationIfReady(ctx, {
			taskId: currentTask._id,
			requestedAt: now,
		});
	}
}

async function applyTaskStatusUpdate(
	ctx: MutationCtx,
	args: {
		task: Doc<"agentTasks">;
		turn: Doc<"agentTurns">;
		update: AgentTaskStatusUpdate;
		now: number;
	},
) {
	const update = normalizeTaskStatusUpdate(args.update);
	switch (update.status) {
		case "completed":
			await terminalizeAgentTask(ctx, {
				task: args.task,
				endedAt: args.now,
				outcome: { status: "completed", result: update.result },
			});
			return;
		case "waiting":
			await ctx.db.replace("agentTasks", args.task._id, {
				...ownedAgentTaskFields(args.task),
				status: "waiting",
				waitingReason: update.reason,
				activeRunIds: [],
				activeApprovalIds: [],
			});
			return;
		case "waiting_for_approval": {
			const existingApproval = await ctx.db
				.query("agentItems")
				.withIndex("by_approval_id", (index) =>
					index.eq("approvalId", update.approvalId),
				)
				.unique();
			if (existingApproval) throw new Error("Approval ID already exists");
			const approvalItemId = await ctx.db.insert("agentItems", {
				turnId: args.turn._id,
				sequence: await nextItemSequence(ctx, args.turn._id),
				createdAt: args.now,
				kind: "approval",
				approvalKind: "task",
				approvalId: update.approvalId,
				request: update.approvalRequest,
				status: "pending",
			});
			await addActiveApproval(ctx, args.task, approvalItemId, []);
			return;
		}
		case "unable_to_continue":
			await terminalizeAgentTask(ctx, {
				task: args.task,
				endedAt: args.now,
				outcome: {
					status: "unable_to_continue",
					result: update.result,
				},
			});
			return;
	}
}
