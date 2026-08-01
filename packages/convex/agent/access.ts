import { ConvexError } from "convex/values";
import { assertAgentTaskLinkBounds } from "#/case/agentOwnership";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { env } from "../_generated/server";

type DatabaseContext = Pick<MutationCtx, "db">;

function runtimeAccessDenied() {
	return new ConvexError({
		code: "AGENT_RUNTIME_ACCESS_DENIED",
		message: "Agent runtime access denied.",
	});
}

function secretsMatch(left: string, right: string) {
	if (left.length !== right.length) return false;
	let difference = 0;
	for (let index = 0; index < left.length; index += 1) {
		difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}
	return difference === 0;
}

export function requireAgentRuntimeSecret(runtimeSecret: string) {
	const configuredSecret = env.AGENT_RUNTIME_SECRET;
	if (
		!configuredSecret ||
		configuredSecret.length < 32 ||
		!secretsMatch(configuredSecret, runtimeSecret)
	) {
		throw runtimeAccessDenied();
	}
}

export async function requireClaimedAgentRun(
	ctx: DatabaseContext,
	args: {
		runId: Id<"agentRuns">;
		claimToken: string;
	},
	access:
		| "active_task"
		| "writable_run"
		| "current_run"
		| "claimed_run" = "active_task",
) {
	const run = await ctx.db.get(args.runId);
	if (
		!run ||
		run.status !== "running" ||
		run.leaseExpiresAt <= Date.now() ||
		!secretsMatch(run.claimToken, args.claimToken)
	) {
		throw new ConvexError({
			code: "AGENT_RUN_CLAIM_LOST",
			message: "The run is no longer claimed by this worker.",
		});
	}
	const turn = await ctx.db.get(run.turnId);
	if (!turn) throw new Error("Claimed agent run is missing its turn");
	const task = await ctx.db.get(turn.taskId);
	if (!task) throw new Error("Claimed agent run is missing its task");
	assertAgentTaskLinkBounds(task);
	const isCurrentTurn = task.activeRunIds.at(-1) === run._id;
	if (access !== "claimed_run" && !isCurrentTurn) {
		throw new ConvexError({
			code: "AGENT_RUN_SUPERSEDED",
			message: "The run was superseded by newer task input.",
		});
	}
	if (
		(access === "active_task" || access === "writable_run") &&
		run.selectedStatusItemId
	) {
		throw new ConvexError({
			code: "AGENT_STATUS_ALREADY_SELECTED",
			message:
				"The run already selected its task status and can only be finalized.",
		});
	}
	if (access === "active_task" && task.status !== "active") {
		throw new ConvexError({
			code: "AGENT_TASK_NOT_ACTIVE",
			message: "The task is no longer active.",
		});
	}
	const anchorCase = await ctx.db.get(task.anchorCaseId);
	if (!anchorCase || anchorCase.organizationId !== task.organizationId) {
		throw new Error("Agent task has an invalid organization partition");
	}
	return { anchorCase, isCurrentTurn, run, task, turn };
}
