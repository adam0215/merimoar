import { ConvexError } from "convex/values";
import type { AgentTaskStatusUpdate } from "#/agent/model";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

const MAX_PRODUCT_TEXT_LENGTH = 20_000;
const MAX_DEBUG_TEXT_LENGTH = 40_000;
const MAX_RUNTIME_IDENTIFIER_LENGTH = 200;
const MIN_CLAIM_TOKEN_LENGTH = 32;

export function normalizeProductText(
	value: string,
	fieldName: string,
	maxLength = MAX_PRODUCT_TEXT_LENGTH,
) {
	const normalized = value.trim();
	if (!normalized) {
		throw new ConvexError({
			code: "INVALID_AGENT_RUNTIME_INPUT",
			message: `${fieldName} is required.`,
		});
	}
	if (normalized.length > maxLength) {
		throw new ConvexError({
			code: "INVALID_AGENT_RUNTIME_INPUT",
			message: `${fieldName} is too long.`,
		});
	}
	return normalized;
}

export function clampDebugText(value: string) {
	return value.slice(0, MAX_DEBUG_TEXT_LENGTH);
}

export function normalizeAgentMessageBody(value: string) {
	const bounded = value.slice(0, MAX_PRODUCT_TEXT_LENGTH);
	if (!bounded.trim()) {
		throw new ConvexError({
			code: "INVALID_AGENT_RUNTIME_INPUT",
			message: "Agent message text is required.",
		});
	}
	return bounded;
}

export function normalizeRuntimeIdentifier(value: string, fieldName: string) {
	if (!value || value.length > MAX_RUNTIME_IDENTIFIER_LENGTH) {
		throw new ConvexError({
			code: "INVALID_AGENT_RUNTIME_INPUT",
			message: `${fieldName} must contain 1 to ${MAX_RUNTIME_IDENTIFIER_LENGTH} characters.`,
		});
	}
	return value;
}

export function normalizeClaimToken(value: string) {
	const claimToken = normalizeRuntimeIdentifier(value, "Claim token");
	if (claimToken.length < MIN_CLAIM_TOKEN_LENGTH) {
		throw new ConvexError({
			code: "INVALID_AGENT_RUNTIME_INPUT",
			message: `Claim token must contain at least ${MIN_CLAIM_TOKEN_LENGTH} characters.`,
		});
	}
	return claimToken;
}

export function normalizeTaskStatusUpdate(
	update: AgentTaskStatusUpdate,
): AgentTaskStatusUpdate {
	switch (update.status) {
		case "completed":
		case "unable_to_continue":
			return {
				status: update.status,
				result: normalizeProductText(update.result, "Result"),
			};
		case "waiting":
			return {
				status: "waiting",
				reason: normalizeProductText(update.reason, "Waiting reason"),
			};
		case "waiting_for_approval":
			return {
				status: "waiting_for_approval",
				approvalId: normalizeRuntimeIdentifier(
					update.approvalId,
					"Approval ID",
				),
				approvalRequest: normalizeProductText(
					update.approvalRequest,
					"Approval request",
				),
			};
	}
}

export function taskStatusUpdatesEqual(
	left: AgentTaskStatusUpdate,
	right: AgentTaskStatusUpdate,
) {
	if (left.status !== right.status) return false;
	switch (left.status) {
		case "completed":
		case "unable_to_continue":
			return right.status === left.status && left.result === right.result;
		case "waiting":
			return right.status === "waiting" && left.reason === right.reason;
		case "waiting_for_approval":
			return (
				right.status === "waiting_for_approval" &&
				left.approvalId === right.approvalId &&
				left.approvalRequest === right.approvalRequest
			);
	}
}

export async function nextItemSequence(
	ctx: MutationCtx,
	turnId: Id<"agentTurns">,
) {
	const latestItem = await ctx.db
		.query("agentItems")
		.withIndex("by_turn_id_and_sequence", (index) => index.eq("turnId", turnId))
		.order("desc")
		.first();
	return (latestItem?.sequence ?? 0) + 1;
}

export async function requireRunToolItem(
	ctx: MutationCtx,
	args: {
		runId: Id<"agentRuns">;
		turnId: Id<"agentTurns">;
		toolCallId: string;
	},
) {
	const toolCallId = normalizeRuntimeIdentifier(
		args.toolCallId,
		"Tool call ID",
	);
	const item = await ctx.db
		.query("agentItems")
		.withIndex("by_run_id_and_tool_call_id", (index) =>
			index.eq("runId", args.runId).eq("toolCallId", toolCallId),
		)
		.unique();
	if (!item || item.kind !== "tool" || item.turnId !== args.turnId) {
		throw new Error("Tool item not found");
	}
	return item;
}
