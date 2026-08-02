import { v } from "convex/values";
import { agentRunBaseFields } from "#/agent/model";
import { finalizeClaimedRun } from "#/agent/runFinalization";
import {
	queueApprovalContinuationIfReady,
	retireAssignedApprovalDecisions,
	terminalizeAgentTask,
} from "#/agent/tasks";
import { internalMutation } from "../_generated/server";

const MAX_LEASE_FAILURES = 3;

export const requeueExpiredRun = internalMutation({
	args: {
		runId: v.id("agentRuns"),
		leaseGeneration: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		if (
			!run ||
			run.status !== "running" ||
			run.leaseGeneration !== args.leaseGeneration ||
			run.leaseExpiresAt > Date.now()
		) {
			return null;
		}

		const turn = await ctx.db.get(run.turnId);
		const task = turn ? await ctx.db.get(turn.taskId) : null;
		if (
			turn &&
			task?.status === "active" &&
			task.activeRunIds.at(-1) === run._id
		) {
			if (run.selectedStatusItemId) {
				await finalizeClaimedRun(ctx, {
					isCurrentTurn: true,
					run,
					task,
					turn,
				});
				return null;
			}
			const leaseFailureCount = (run.leaseFailureCount ?? 0) + 1;
			if (leaseFailureCount >= MAX_LEASE_FAILURES) {
				const now = Date.now();
				const error =
					"Agent execution stopped after repeatedly losing its worker lease.";
				const latestItem = await ctx.db
					.query("agentItems")
					.withIndex("by_turn_id_and_sequence", (index) =>
						index.eq("turnId", run.turnId),
					)
					.order("desc")
					.first();
				await ctx.db.insert("agentItems", {
					turnId: run.turnId,
					sequence: (latestItem?.sequence ?? 0) + 1,
					createdAt: now,
					kind: "error",
					runId: run._id,
					message: error,
				});
				await ctx.db.replace("agentRuns", run._id, {
					...agentRunBaseFields(run),
					leaseFailureCount,
					status: "failed",
					endedAt: now,
					error,
				});
				await terminalizeAgentTask(ctx, {
					task,
					endedAt: now,
					outcome: { status: "failed", error },
				});
				console.error("agent_run_finished", {
					runId: run._id,
					taskId: task._id,
					agentKey: task.agentKey,
					runStatus: "failed",
					taskStatus: "failed",
					reason: "lease_exhausted",
					attempt: run.attemptCount,
				});
				return null;
			}
			await ctx.db.replace("agentRuns", run._id, {
				...agentRunBaseFields(run),
				leaseFailureCount,
				status: "queued",
			});
			return null;
		}

		await ctx.db.replace("agentRuns", run._id, {
			...agentRunBaseFields(run),
			status: "cancelled",
			endedAt: Date.now(),
			reason: "The task ended before this run could continue.",
		});
		if (task?.activeRunIds.includes(run._id)) {
			const taskAfterApprovalReplay = await retireAssignedApprovalDecisions(
				ctx,
				task,
				run._id,
				Date.now(),
			);
			await ctx.db.patch(taskAfterApprovalReplay._id, {
				activeRunIds: taskAfterApprovalReplay.activeRunIds.filter(
					(runId) => runId !== run._id,
				),
			});
			if (
				taskAfterApprovalReplay.status === "waiting_for_approval" &&
				taskAfterApprovalReplay.activeApprovalIds.length > 0
			) {
				await queueApprovalContinuationIfReady(ctx, {
					taskId: taskAfterApprovalReplay._id,
					requestedAt: Date.now(),
				});
			}
		}
		return null;
	},
});
