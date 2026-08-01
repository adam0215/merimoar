import { type Infer, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DatabaseContext = Pick<QueryCtx | MutationCtx, "db">;

export const MAX_ACTIVE_AGENT_RUNS = 20;
export const MAX_ACTIVE_AGENT_APPROVALS = 20;

export function assertAgentTaskLinkBounds(task: Doc<"agentTasks">) {
	if (
		task.activeRunIds.length > MAX_ACTIVE_AGENT_RUNS ||
		new Set(task.activeRunIds).size !== task.activeRunIds.length
	) {
		throw new Error("Active agent task has an invalid run ledger");
	}
	if (
		task.activeApprovalIds.length > MAX_ACTIVE_AGENT_APPROVALS ||
		new Set(task.activeApprovalIds).size !== task.activeApprovalIds.length
	) {
		throw new Error("Active agent task has an invalid approval ledger");
	}
}

export const activeAgentTaskSummaryValidator = v.union(
	v.object({
		taskId: v.id("agentTasks"),
		agentKey: v.string(),
		status: v.literal("active"),
		runStatus: v.union(v.literal("queued"), v.literal("running"), v.null()),
		activity: v.union(
			v.object({ title: v.string(), detail: v.optional(v.string()) }),
			v.null(),
		),
	}),
	v.object({
		taskId: v.id("agentTasks"),
		agentKey: v.string(),
		status: v.literal("waiting"),
		reason: v.string(),
	}),
	v.object({
		taskId: v.id("agentTasks"),
		agentKey: v.string(),
		status: v.literal("waiting_for_approval"),
		pendingApprovalCount: v.number(),
	}),
);

type ActiveAgentTaskSummary = Infer<typeof activeAgentTaskSummaryValidator>;

export async function getActiveAgentTaskForCase(
	ctx: DatabaseContext,
	caseId: Id<"cases">,
) {
	const task = await ctx.db
		.query("agentTasks")
		.withIndex("by_anchor_case_id_and_ownership_released_at", (index) =>
			index.eq("anchorCaseId", caseId).eq("ownershipReleasedAt", null),
		)
		.unique();
	if (task) assertAgentTaskLinkBounds(task);
	return task;
}

export async function getActiveAgentTaskSummaryForCase(
	ctx: DatabaseContext,
	caseId: Id<"cases">,
	organizationId: Id<"organizations">,
): Promise<ActiveAgentTaskSummary | null> {
	const task = await getActiveAgentTaskForCase(ctx, caseId);
	if (!task) return null;
	if (task.organizationId !== organizationId) {
		throw new Error("Agent task has an invalid organization partition");
	}

	switch (task.status) {
		case "active": {
			const runId = task.activeRunIds.at(-1);
			if (!runId) {
				return {
					taskId: task._id,
					agentKey: task.agentKey,
					status: "active",
					runStatus: null,
					activity: null,
				};
			}
			const run = await ctx.db.get(runId);
			if (!run || (run.status !== "queued" && run.status !== "running")) {
				throw new Error("Active agent task has an invalid current run");
			}
			const turn = await ctx.db.get(run.turnId);
			if (!turn || turn.taskId !== task._id) {
				throw new Error("Active agent run belongs to another task");
			}
			const activity = await ctx.db
				.query("agentItems")
				.withIndex("by_run_id_and_kind_and_sequence", (index) =>
					index.eq("runId", run._id).eq("kind", "activity"),
				)
				.order("desc")
				.first();
			if (
				activity &&
				(activity.kind !== "activity" || activity.turnId !== turn._id)
			) {
				throw new Error("Agent activity index returned an invalid item");
			}
			return {
				taskId: task._id,
				agentKey: task.agentKey,
				status: "active",
				runStatus: run.status,
				activity: activity
					? {
							title: activity.title,
							...(activity.detail ? { detail: activity.detail } : {}),
						}
					: null,
			};
		}
		case "waiting":
			return {
				taskId: task._id,
				agentKey: task.agentKey,
				status: "waiting",
				reason: task.waitingReason,
			};
		case "waiting_for_approval": {
			const approvals = await getActiveAgentTaskApprovals(ctx, task);
			return {
				taskId: task._id,
				agentKey: task.agentKey,
				status: "waiting_for_approval",
				pendingApprovalCount: approvals.filter(
					(approval) => approval.status === "pending",
				).length,
			};
		}
		case "completed":
		case "unable_to_continue":
		case "failed":
		case "cancelled":
			throw new Error("A released agent task cannot own a case");
	}
}

export async function getActiveAgentTaskApprovals(
	ctx: DatabaseContext,
	task: Doc<"agentTasks">,
) {
	return (await resolveActiveAgentTaskLinks(ctx, task)).approvals;
}

export async function resolveActiveAgentTaskLinks(
	ctx: DatabaseContext,
	task: Doc<"agentTasks">,
) {
	assertAgentTaskLinkBounds(task);
	const runs = await Promise.all(
		task.activeRunIds.map(async (runId) => {
			const run = await ctx.db.get(runId);
			if (!run) throw new Error("Active agent task run is missing");
			const turn = await ctx.db.get(run.turnId);
			if (!turn || turn.taskId !== task._id) {
				throw new Error("Active agent task run belongs to another task");
			}
			return run;
		}),
	);
	const approvals = await Promise.all(
		task.activeApprovalIds.map(async (approvalId) => {
			const approval = await ctx.db.get(approvalId);
			if (!approval || approval.kind !== "approval") {
				throw new Error("Active agent task approval is missing");
			}
			const turn = await ctx.db.get(approval.turnId);
			if (!turn || turn.taskId !== task._id) {
				throw new Error("Active agent task approval belongs to another task");
			}
			if (approval.approvalKind === "tool") {
				const toolItem = await ctx.db.get(approval.toolItemId);
				if (
					!toolItem ||
					toolItem.kind !== "tool" ||
					toolItem.turnId !== approval.turnId ||
					toolItem.status !== "approval_required"
				) {
					throw new Error(
						"Active agent task approval has an invalid tool item",
					);
				}
			}
			const continuationRunId =
				"continuationRunId" in approval
					? approval.continuationRunId
					: undefined;
			if (continuationRunId) {
				const continuationRun = await ctx.db.get(continuationRunId);
				const continuationTurn = continuationRun
					? await ctx.db.get(continuationRun.turnId)
					: null;
				if (!continuationTurn || continuationTurn.taskId !== task._id) {
					throw new Error(
						"Active agent task approval continuation belongs to another task",
					);
				}
			}
			return approval;
		}),
	);
	return { approvals, runs };
}
