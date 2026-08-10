import { paginationOptsValidator } from "convex/server";
import { type Infer, v } from "convex/values";
import { queueApprovalContinuationIfReady } from "#/agent/tasks";
import { getActiveAgentTaskApprovals } from "#/case/agentOwnership";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";

const EMAIL_TOOL_NAME = "send_email";
const INVALIDATION_BATCH_SIZE = 20;

const emailApprovalInvalidationRequestValidator = v.union(
	v.object({
		organizationId: v.id("organizations"),
		invalidatedAt: v.number(),
		threadId: v.id("emailThreads"),
		cause: v.object({
			kind: v.literal("inbound_email_received"),
			messageId: v.id("emailMessages"),
		}),
	}),
	v.object({
		organizationId: v.id("organizations"),
		invalidatedAt: v.number(),
		cause: v.object({
			kind: v.literal("email_tool_disabled"),
		}),
	}),
);

type EmailApprovalInvalidationRequest = Infer<
	typeof emailApprovalInvalidationRequestValidator
>;

type PendingToolApproval = Extract<
	Doc<"agentItems">,
	{ kind: "approval"; approvalKind: "tool"; status: "pending" }
>;

function readEmailThreadIdFromToolInput(
	tool: Extract<Doc<"agentItems">, { kind: "tool" }>,
) {
	if (tool.toolName !== EMAIL_TOOL_NAME) return null;
	const input = JSON.parse(tool.inputJson) as {
		threadId: Id<"emailThreads">;
	};
	return input.threadId;
}

async function getPendingEmailApprovalTarget(
	ctx: MutationCtx,
	approval: PendingToolApproval,
) {
	const tool = await ctx.db.get(approval.toolItemId);
	if (!tool || tool.kind !== "tool") {
		throw new Error("Email approval has an invalid tool item");
	}
	const threadId = readEmailThreadIdFromToolInput(tool);
	return threadId ? { tool, threadId } : null;
}

function matchesInvalidationRequest(
	request: EmailApprovalInvalidationRequest,
	approval: PendingToolApproval,
	target: {
		tool: Extract<Doc<"agentItems">, { kind: "tool" }>;
		threadId: Id<"emailThreads">;
	},
) {
	switch (request.cause.kind) {
		case "inbound_email_received":
			return (
				"threadId" in request &&
				target.threadId === request.threadId &&
				target.tool.createdAt <= request.invalidatedAt
			);
		case "email_tool_disabled":
			return approval.createdAt <= request.invalidatedAt;
	}
}

async function invalidatePendingEmailApprovalsForTask(
	ctx: MutationCtx,
	task: Doc<"agentTasks">,
	request: EmailApprovalInvalidationRequest,
) {
	if (task.status !== "waiting_for_approval") return;
	let invalidated = false;
	for (const approval of await getActiveAgentTaskApprovals(ctx, task)) {
		if (
			approval.kind !== "approval" ||
			approval.approvalKind !== "tool" ||
			approval.status !== "pending"
		) {
			continue;
		}
		const target = await getPendingEmailApprovalTarget(ctx, approval);
		if (!target || !matchesInvalidationRequest(request, approval, target)) {
			continue;
		}
		await ctx.db.patch(approval._id, {
			status: "invalidated",
			invalidatedAt: request.invalidatedAt,
			invalidationCause: request.cause,
		});
		invalidated = true;
	}
	if (invalidated) {
		await queueApprovalContinuationIfReady(ctx, {
			taskId: task._id,
			requestedAt: request.invalidatedAt,
		});
	}
}

export async function invalidatePendingAgentEmailApprovals(
	ctx: Pick<MutationCtx, "scheduler">,
	request: EmailApprovalInvalidationRequest,
) {
	await ctx.scheduler.runAfter(
		0,
		internal.agent.approvalInvalidation.invalidatePendingEmailApprovals,
		{
			request,
			paginationOpts: {
				cursor: null,
				numItems: INVALIDATION_BATCH_SIZE,
			},
		},
	);
}

export const invalidatePendingEmailApprovals = internalMutation({
	args: {
		request: emailApprovalInvalidationRequestValidator,
		paginationOpts: paginationOptsValidator,
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const page = await ctx.db
			.query("agentTasks")
			.withIndex("by_organization_id_and_status_and_requested_at", (index) =>
				index
					.eq("organizationId", args.request.organizationId)
					.eq("status", "waiting_for_approval"),
			)
			.order("asc")
			.paginate(args.paginationOpts);

		for (const task of page.page) {
			await invalidatePendingEmailApprovalsForTask(ctx, task, args.request);
		}
		if (!page.isDone) {
			await ctx.scheduler.runAfter(
				0,
				internal.agent.approvalInvalidation.invalidatePendingEmailApprovals,
				{
					request: args.request,
					paginationOpts: {
						cursor: page.continueCursor,
						numItems: INVALIDATION_BATCH_SIZE,
					},
				},
			);
		}
		return null;
	},
});
