import { v } from "convex/values";
import { agentTaskStatusUpdateValidator } from "#/agent/model";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

const MAX_CONTEXT_RECENT_TURNS = 10;
const MAX_CONTEXT_ITEMS_PER_TURN = 50;
const MAX_CONTEXT_SERIALIZED_BYTES = 500_000;
const TRANSACTION_BYTES_READ_RESERVE = 1_000_000;

const transcriptItemValidator = v.union(
	v.object({
		kind: v.literal("member_message"),
		body: v.string(),
		sequence: v.number(),
	}),
	v.object({
		kind: v.literal("member_message_steer"),
		runId: v.id("agentRuns"),
		body: v.string(),
		sequence: v.number(),
	}),
	v.object({
		kind: v.literal("system_message"),
		body: v.string(),
		source: v.string(),
		sequence: v.number(),
	}),
	v.object({
		kind: v.literal("agent_message"),
		body: v.string(),
		sequence: v.number(),
	}),
	v.object({
		kind: v.literal("tool"),
		_id: v.id("agentItems"),
		toolCallId: v.string(),
		toolName: v.string(),
		runId: v.id("agentRuns"),
		inputJson: v.string(),
		sequence: v.number(),
		status: v.union(v.literal("started"), v.literal("approval_required")),
	}),
	v.object({
		kind: v.literal("tool"),
		_id: v.id("agentItems"),
		toolCallId: v.string(),
		toolName: v.string(),
		runId: v.id("agentRuns"),
		inputJson: v.string(),
		sequence: v.number(),
		status: v.literal("completed"),
		outputJson: v.optional(v.string()),
		taskStatusUpdate: v.optional(agentTaskStatusUpdateValidator),
	}),
	v.object({
		kind: v.literal("tool"),
		_id: v.id("agentItems"),
		toolCallId: v.string(),
		toolName: v.string(),
		runId: v.id("agentRuns"),
		inputJson: v.string(),
		sequence: v.number(),
		status: v.literal("failed"),
		error: v.string(),
	}),
	v.object({
		kind: v.literal("approval"),
		approvalId: v.string(),
		approvalKind: v.union(v.literal("tool"), v.literal("task")),
		toolItemId: v.optional(v.id("agentItems")),
		signature: v.optional(v.string()),
		request: v.string(),
		status: v.union(
			v.literal("pending"),
			v.literal("approved"),
			v.literal("denied"),
		),
		answerReason: v.optional(v.string()),
		continuationRunId: v.optional(v.id("agentRuns")),
		consumedAt: v.optional(v.number()),
		sequence: v.number(),
	}),
	v.object({
		kind: v.literal("activity"),
		title: v.string(),
		detail: v.optional(v.string()),
		sequence: v.number(),
	}),
	v.object({
		kind: v.literal("error"),
		sequence: v.number(),
	}),
);

export const runtimeTranscriptValidator = v.object({
	taskId: v.id("agentTasks"),
	selectedStatusItemId: v.optional(v.id("agentItems")),
	turns: v.array(
		v.object({
			turnId: v.id("agentTurns"),
			sequence: v.number(),
			items: v.array(transcriptItemValidator),
		}),
	),
});

export async function loadRuntimeTranscript(
	ctx: MutationCtx,
	args: {
		run: Extract<Doc<"agentRuns">, { status: "running" }>;
		task: Doc<"agentTasks">;
	},
) {
	const [initialTurn, recentTurns] = await Promise.all([
		ctx.db
			.query("agentTurns")
			.withIndex("by_task_id_and_sequence", (index) =>
				index.eq("taskId", args.task._id),
			)
			.order("asc")
			.first(),
		ctx.db
			.query("agentTurns")
			.withIndex("by_task_id_and_sequence", (index) =>
				index.eq("taskId", args.task._id),
			)
			.order("desc")
			.take(MAX_CONTEXT_RECENT_TURNS),
	]);
	const turns = [...(initialTurn ? [initialTurn] : []), ...recentTurns]
		.filter(
			(turn, index, all) =>
				all.findIndex((candidate) => candidate._id === turn._id) === index,
		)
		.sort((left, right) => left.sequence - right.sequence);
	let remainingSerializedBytes = MAX_CONTEXT_SERIALIZED_BYTES;
	const itemsByTurnId = new Map<
		Doc<"agentTurns">["_id"],
		ReturnType<typeof projectTranscriptItem>[]
	>();
	let initialItem: ReturnType<typeof projectTranscriptItem> | undefined;
	if (initialTurn) {
		const firstItem = await ctx.db
			.query("agentItems")
			.withIndex("by_turn_id_and_sequence", (index) =>
				index.eq("turnId", initialTurn._id),
			)
			.order("asc")
			.first();
		if (firstItem) {
			initialItem = projectTranscriptItem(firstItem);
			remainingSerializedBytes -= conservativeSerializedBytes(initialItem);
		}
	}
	for (const turn of [...recentTurns, ...(initialTurn ? [initialTurn] : [])]) {
		if (itemsByTurnId.has(turn._id)) continue;
		const result = await loadRecentTurnItems(ctx, {
			turn,
			remainingSerializedBytes,
			initialItem: turn._id === initialTurn?._id ? initialItem : undefined,
		});
		itemsByTurnId.set(turn._id, result.items);
		remainingSerializedBytes -= result.serializedBytes;
		if (remainingSerializedBytes <= 0) break;
	}
	return {
		taskId: args.task._id,
		...(args.run.selectedStatusItemId
			? { selectedStatusItemId: args.run.selectedStatusItemId }
			: {}),
		turns: turns.map((turn) => ({
			turnId: turn._id,
			sequence: turn.sequence,
			items: itemsByTurnId.get(turn._id) ?? [],
		})),
	};
}

async function loadRecentTurnItems(
	ctx: MutationCtx,
	args: {
		turn: Doc<"agentTurns">;
		remainingSerializedBytes: number;
		initialItem?: ReturnType<typeof projectTranscriptItem>;
	},
) {
	const items = args.initialItem ? [args.initialItem] : [];
	let serializedBytes = 0;
	for await (const item of ctx.db
		.query("agentItems")
		.withIndex("by_turn_id_and_sequence", (index) =>
			index.eq("turnId", args.turn._id),
		)
		.order("desc")) {
		if (items.length >= MAX_CONTEXT_ITEMS_PER_TURN) break;
		if (args.initialItem && item.sequence === args.initialItem.sequence)
			continue;
		const metrics = await ctx.meta.getTransactionMetrics();
		if (metrics.bytesRead.remaining < TRANSACTION_BYTES_READ_RESERVE) break;
		const projected = projectTranscriptItem(item);
		const itemBytes = conservativeSerializedBytes(projected);
		if (
			serializedBytes + itemBytes >
			Math.max(0, args.remainingSerializedBytes)
		) {
			break;
		}
		items.push(projected);
		serializedBytes += itemBytes;
	}
	items.sort((left, right) => left.sequence - right.sequence);
	return { items, serializedBytes };
}

function conservativeSerializedBytes(value: unknown) {
	return JSON.stringify(value).length * 4;
}

function projectTranscriptItem(item: Doc<"agentItems">) {
	switch (item.kind) {
		case "member_message":
			return { kind: item.kind, body: item.body, sequence: item.sequence };
		case "member_message_steer":
			return {
				kind: item.kind,
				runId: item.runId,
				body: item.body,
				sequence: item.sequence,
			};
		case "system_message":
			return {
				kind: item.kind,
				body: item.body,
				source: item.source,
				sequence: item.sequence,
			};
		case "agent_message":
			return { kind: item.kind, body: item.body, sequence: item.sequence };
		case "tool": {
			const base = {
				kind: item.kind,
				_id: item._id,
				toolCallId: item.toolCallId,
				toolName: item.toolName,
				runId: item.runId,
				inputJson: item.inputJson,
				sequence: item.sequence,
			};
			if (item.status === "completed") {
				return {
					...base,
					status: item.status,
					...("outputJson" in item ? { outputJson: item.outputJson } : {}),
					...("taskStatusUpdate" in item
						? { taskStatusUpdate: item.taskStatusUpdate }
						: {}),
				};
			}
			return item.status === "failed"
				? { ...base, status: item.status, error: item.error }
				: { ...base, status: item.status };
		}
		case "approval":
			return {
				kind: item.kind,
				approvalId: item.approvalId,
				approvalKind: item.approvalKind,
				...("toolItemId" in item ? { toolItemId: item.toolItemId } : {}),
				...("signature" in item && item.signature
					? { signature: item.signature }
					: {}),
				request: item.request,
				status: item.status,
				...("answerReason" in item && item.answerReason
					? { answerReason: item.answerReason }
					: {}),
				...("continuationRunId" in item && item.continuationRunId
					? { continuationRunId: item.continuationRunId }
					: {}),
				...("consumedAt" in item && item.consumedAt !== undefined
					? { consumedAt: item.consumedAt }
					: {}),
				sequence: item.sequence,
			};
		case "activity":
			return {
				kind: item.kind,
				title: item.title,
				...(item.detail ? { detail: item.detail } : {}),
				sequence: item.sequence,
			};
		case "error":
			return { kind: item.kind, sequence: item.sequence };
	}
}
