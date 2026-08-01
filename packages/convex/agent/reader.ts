import {
	paginationOptsValidator,
	paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import {
	auditItemValidator,
	auditRunValidator,
	auditTaskValidator,
	projectAuditItem,
	projectAuditRun,
	projectAuditTask,
} from "#/agent/auditModel";
import { agentTurnValidator } from "#/agent/model";
import { requireActor } from "#/auth/access";
import { getActiveAgentTaskApprovals } from "#/case/agentOwnership";
import { getWorkosUser, getWorkosUserDisplayName } from "#/workos";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { query } from "../_generated/server";

const taskAuditResultValidator = v.union(
	v.object({
		taskId: v.id("agentTasks"),
		task: auditTaskValidator,
		requestedByMember: v.union(
			v.object({
				id: v.id("organizationMembers"),
				name: v.string(),
			}),
			v.null(),
		),
		anchorCase: v.object({
			id: v.id("cases"),
			reference: v.string(),
			title: v.string(),
		}),
	}),
	v.null(),
);

const turnAuditValidator = v.object({
	turnId: v.id("agentTurns"),
	turn: agentTurnValidator,
	requestedByMember: v.union(
		v.object({
			id: v.id("organizationMembers"),
			name: v.string(),
		}),
		v.null(),
	),
});

const itemAuditValidator = v.object({
	itemId: v.id("agentItems"),
	item: auditItemValidator,
});

const runAuditValidator = v.object({
	runId: v.id("agentRuns"),
	run: auditRunValidator,
});

const anchorCaseValidator = v.object({
	id: v.id("cases"),
	reference: v.string(),
	title: v.string(),
});

const workspaceTaskValidator = v.object({
	taskId: v.id("agentTasks"),
	task: auditTaskValidator,
	anchorCase: anchorCaseValidator,
	latestItem: v.union(itemAuditValidator, v.null()),
	updatedAt: v.number(),
	pendingApprovalCount: v.number(),
});

const pendingApprovalGroupValidator = v.object({
	taskId: v.id("agentTasks"),
	anchorCase: anchorCaseValidator,
	approvals: v.array(itemAuditValidator),
});

const recentDelegationValidator = v.object({
	taskId: v.id("agentTasks"),
	task: auditTaskValidator,
	anchorCase: anchorCaseValidator,
});

const MAX_WORKSPACE_TASKS = 100;
const MAX_PENDING_APPROVAL_TASKS = 100;
const MAX_RECENT_DELEGATIONS = 10;
const MAX_RECENT_TURNS = 5;
const MAX_RECENT_ITEMS = 5;

export const get = query({
	args: {
		taskId: v.string(),
	},
	returns: taskAuditResultValidator,
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		const taskId = ctx.db.normalizeId("agentTasks", args.taskId);
		if (!taskId) return null;
		const task = await ctx.db.get(taskId);
		if (!task) return null;
		const anchorCase = await ctx.db.get(task.anchorCaseId);
		if (
			task.organizationId !== actor.organization._id ||
			!anchorCase ||
			anchorCase.organizationId !== task.organizationId
		) {
			return null;
		}
		return {
			taskId: task._id,
			task: projectAuditTask(task),
			requestedByMember: await resolveRequestedByMember(
				ctx,
				actor.organization._id,
				task.requestedByMemberId,
			),
			anchorCase: {
				id: anchorCase._id,
				reference: anchorCase.reference,
				title: anchorCase.title,
			},
		};
	},
});

export const listWorkspaceTasks = query({
	args: {},
	returns: v.array(workspaceTaskValidator),
	handler: async (ctx) => {
		const actor = await requireActor(ctx);
		const tasks = await ctx.db
			.query("agentTasks")
			.withIndex("by_organization_id_and_requested_at", (index) =>
				index.eq("organizationId", actor.organization._id),
			)
			.order("desc")
			.take(MAX_WORKSPACE_TASKS);
		const taskRecords = await loadOrganizationTaskRecords(
			ctx,
			actor.organization._id,
			tasks,
		);
		return await Promise.all(
			taskRecords.map(async ({ anchorCase, task }) => {
				const latestItem = await getLatestTaskItem(ctx, task._id);
				const pendingApprovalCount =
					task.status === "waiting_for_approval"
						? (await getActiveAgentTaskApprovals(ctx, task)).filter(
								(approval) => approval.status === "pending",
							).length
						: 0;
				return {
					taskId: task._id,
					task: projectAuditTask(task),
					anchorCase: projectAnchorCase(anchorCase),
					latestItem: latestItem
						? {
								itemId: latestItem._id,
								item: projectAuditItem(latestItem),
							}
						: null,
					updatedAt:
						latestItem?.createdAt ??
						task.ownershipReleasedAt ??
						task.requestedAt,
					pendingApprovalCount,
				};
			}),
		);
	},
});

export const listPendingApprovals = query({
	args: {},
	returns: v.array(pendingApprovalGroupValidator),
	handler: async (ctx) => {
		const actor = await requireActor(ctx);
		const tasks = await ctx.db
			.query("agentTasks")
			.withIndex("by_organization_id_and_status_and_requested_at", (index) =>
				index
					.eq("organizationId", actor.organization._id)
					.eq("status", "waiting_for_approval"),
			)
			.order("desc")
			.take(MAX_PENDING_APPROVAL_TASKS);
		const taskRecords = await loadOrganizationTaskRecords(
			ctx,
			actor.organization._id,
			tasks,
		);
		const groups = await Promise.all(
			taskRecords.map(async ({ anchorCase, task }) => {
				if (task.status !== "waiting_for_approval") return null;
				const approvals = (await getActiveAgentTaskApprovals(ctx, task))
					.filter((approval) => approval.status === "pending")
					.map((approval) => ({
						itemId: approval._id,
						item: projectAuditItem(approval),
					}));
				if (approvals.length === 0) return null;
				return {
					taskId: task._id,
					anchorCase: projectAnchorCase(anchorCase),
					approvals,
				};
			}),
		);
		return groups.filter((group) => group !== null);
	},
});

export const listRecentDelegations = query({
	args: {},
	returns: v.array(recentDelegationValidator),
	handler: async (ctx) => {
		const actor = await requireActor(ctx);
		const tasks = await ctx.db
			.query("agentTasks")
			.withIndex(
				"by_organization_id_and_requested_by_member_id_and_requested_at",
				(index) =>
					index
						.eq("organizationId", actor.organization._id)
						.eq("requestedByMemberId", actor.member._id),
			)
			.order("desc")
			.take(MAX_RECENT_DELEGATIONS);
		const taskRecords = await loadOrganizationTaskRecords(
			ctx,
			actor.organization._id,
			tasks,
		);
		return taskRecords.map(({ anchorCase, task }) => ({
			taskId: task._id,
			task: projectAuditTask(task),
			anchorCase: projectAnchorCase(anchorCase),
		}));
	},
});

export const listRecentItems = query({
	args: {
		taskId: v.id("agentTasks"),
	},
	returns: v.array(itemAuditValidator),
	handler: async (ctx, args) => {
		await requireAuditableTask(ctx, args.taskId);
		const turns = await ctx.db
			.query("agentTurns")
			.withIndex("by_task_id_and_sequence", (index) =>
				index.eq("taskId", args.taskId),
			)
			.order("desc")
			.take(MAX_RECENT_TURNS);
		const turnSequences = new Map(
			turns.map((turn) => [turn._id, turn.sequence]),
		);
		const items = (
			await Promise.all(
				turns.map((turn) =>
					ctx.db
						.query("agentItems")
						.withIndex("by_turn_id_and_sequence", (index) =>
							index.eq("turnId", turn._id),
						)
						.order("desc")
						.take(MAX_RECENT_ITEMS),
				),
			)
		)
			.flat()
			.sort((left, right) => {
				return (
					(turnSequences.get(left.turnId) ?? 0) -
						(turnSequences.get(right.turnId) ?? 0) ||
					left.sequence - right.sequence
				);
			})
			.slice(-MAX_RECENT_ITEMS);
		return items.map((item) => ({
			itemId: item._id,
			item: projectAuditItem(item),
		}));
	},
});

export const listTurns = query({
	args: {
		taskId: v.id("agentTasks"),
		paginationOpts: paginationOptsValidator,
	},
	returns: paginationResultValidator(turnAuditValidator),
	handler: async (ctx, args) => {
		const { organizationId } = await requireAuditableTask(ctx, args.taskId);
		const result = await ctx.db
			.query("agentTurns")
			.withIndex("by_task_id_and_sequence", (index) =>
				index.eq("taskId", args.taskId),
			)
			.paginate(args.paginationOpts);
		const requestedByMembers = await resolveRequestedByMembers(
			ctx,
			organizationId,
			result.page.flatMap((turn) =>
				turn.requestedByMemberId ? [turn.requestedByMemberId] : [],
			),
		);
		return {
			...result,
			page: result.page.map((turn) => ({
				turnId: turn._id,
				requestedByMember: turn.requestedByMemberId
					? (requestedByMembers.get(turn.requestedByMemberId) ?? null)
					: null,
				turn: {
					taskId: turn.taskId,
					sequence: turn.sequence,
					requestedAt: turn.requestedAt,
					requestedBy: turn.requestedBy,
					...(turn.requestedByMemberId
						? { requestedByMemberId: turn.requestedByMemberId }
						: {}),
				},
			})),
		};
	},
});

export const listItems = query({
	args: {
		taskId: v.id("agentTasks"),
		turnId: v.id("agentTurns"),
		paginationOpts: paginationOptsValidator,
	},
	returns: paginationResultValidator(itemAuditValidator),
	handler: async (ctx, args) => {
		await requireAuditableTurn(ctx, args.taskId, args.turnId);
		const result = await ctx.db
			.query("agentItems")
			.withIndex("by_turn_id_and_sequence", (index) =>
				index.eq("turnId", args.turnId),
			)
			.paginate(args.paginationOpts);
		return {
			...result,
			page: result.page.map((item) => ({
				itemId: item._id,
				item: projectAuditItem(item),
			})),
		};
	},
});

export const listRuns = query({
	args: {
		taskId: v.id("agentTasks"),
		turnId: v.id("agentTurns"),
		paginationOpts: paginationOptsValidator,
	},
	returns: paginationResultValidator(runAuditValidator),
	handler: async (ctx, args) => {
		await requireAuditableTurn(ctx, args.taskId, args.turnId);
		const result = await ctx.db
			.query("agentRuns")
			.withIndex("by_turn_id_and_requested_at", (index) =>
				index.eq("turnId", args.turnId),
			)
			.paginate(args.paginationOpts);
		return {
			...result,
			page: result.page.map((run) => ({
				runId: run._id,
				run: projectAuditRun(run),
			})),
		};
	},
});

async function requireAuditableTask(ctx: QueryCtx, taskId: Id<"agentTasks">) {
	const actor = await requireActor(ctx);
	const task = await ctx.db.get(taskId);
	const anchorCase = task ? await ctx.db.get(task.anchorCaseId) : null;
	if (
		!task ||
		task.organizationId !== actor.organization._id ||
		!anchorCase ||
		anchorCase.organizationId !== task.organizationId
	) {
		throw new ConvexError({
			code: "AGENT_TASK_NOT_FOUND",
			message: "The agent task could not be found.",
		});
	}
	return { task, organizationId: task.organizationId };
}

async function requireAuditableTurn(
	ctx: QueryCtx,
	taskId: Id<"agentTasks">,
	turnId: Id<"agentTurns">,
) {
	await requireAuditableTask(ctx, taskId);
	const turn = await ctx.db.get(turnId);
	if (!turn || turn.taskId !== taskId) {
		throw new ConvexError({
			code: "AGENT_TURN_NOT_FOUND",
			message: "The agent turn could not be found.",
		});
	}
	return turn;
}

async function resolveRequestedByMember(
	ctx: Pick<QueryCtx, "db" | "runQuery">,
	organizationId: Id<"organizations">,
	memberId: Id<"organizationMembers"> | undefined,
) {
	if (!memberId) return null;
	const member = await ctx.db.get(memberId);
	if (!member || member.organizationId !== organizationId) return null;
	const user = await getWorkosUser(ctx, member.workosUserId);
	return {
		id: member._id,
		name: user ? getWorkosUserDisplayName(user) : "Former member",
	};
}

async function resolveRequestedByMembers(
	ctx: Pick<QueryCtx, "db" | "runQuery">,
	organizationId: Id<"organizations">,
	memberIds: Id<"organizationMembers">[],
) {
	const entries = await Promise.all(
		[...new Set(memberIds)].map(
			async (memberId) =>
				[
					memberId,
					await resolveRequestedByMember(ctx, organizationId, memberId),
				] as const,
		),
	);
	return new Map(entries);
}

async function loadOrganizationTaskRecords(
	ctx: QueryCtx,
	organizationId: Id<"organizations">,
	tasks: Doc<"agentTasks">[],
) {
	const records = await Promise.all(
		tasks.map(async (task) => {
			if (task.organizationId !== organizationId) return null;
			const anchorCase = await ctx.db.get(task.anchorCaseId);
			if (!anchorCase || anchorCase.organizationId !== task.organizationId) {
				return null;
			}
			return { anchorCase, task };
		}),
	);
	return records.filter((record) => record !== null);
}

async function getLatestTaskItem(ctx: QueryCtx, taskId: Id<"agentTasks">) {
	const latestTurn = await ctx.db
		.query("agentTurns")
		.withIndex("by_task_id_and_sequence", (index) => index.eq("taskId", taskId))
		.order("desc")
		.first();
	if (!latestTurn) return null;
	return await ctx.db
		.query("agentItems")
		.withIndex("by_turn_id_and_sequence", (index) =>
			index.eq("turnId", latestTurn._id),
		)
		.order("desc")
		.first();
}

function projectAnchorCase(anchorCase: Doc<"cases">) {
	return {
		id: anchorCase._id,
		reference: anchorCase.reference,
		title: anchorCase.title,
	};
}
