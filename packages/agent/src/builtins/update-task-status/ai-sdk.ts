import { valibotSchema } from "@ai-sdk/valibot";
import { tool } from "ai";
import * as v from "valibot";
import type { AgentContext } from "../../types";

export type UpdateTaskStatusInput =
	| { status: "completed"; result: string }
	| { status: "waiting"; reason: string }
	| { status: "waiting_for_approval"; approvalRequest: string }
	| { status: "unable_to_continue"; result: string };

const statusDetailSchema = v.pipe(
	v.string(),
	v.minLength(1),
	v.maxLength(20_000),
);

export const updateTaskStatusInputSchema = v.variant("status", [
	v.strictObject({
		status: v.literal("completed"),
		result: statusDetailSchema,
	}),
	v.strictObject({
		status: v.literal("waiting"),
		reason: statusDetailSchema,
	}),
	v.strictObject({
		status: v.literal("waiting_for_approval"),
		approvalRequest: statusDetailSchema,
	}),
	v.strictObject({
		status: v.literal("unable_to_continue"),
		result: statusDetailSchema,
	}),
]);

export function createUpdateTaskStatusTool(context: AgentContext) {
	return tool({
		description:
			"Set the task's durable next state. Call this exactly once, by itself in the final tool step, after every business tool and activity update has finished. Never call another tool in parallel with it.",
		inputSchema: valibotSchema(updateTaskStatusInputSchema),
		execute: (input, options) =>
			executeUpdateTaskStatus(context, input, options.toolCallId),
	});
}

export async function executeUpdateTaskStatus(
	context: AgentContext,
	input: UpdateTaskStatusInput,
	toolCallId: string,
) {
	const update =
		input.status === "waiting_for_approval"
			? {
					status: "waiting_for_approval" as const,
					approvalId: await createApprovalId(context.taskId, toolCallId),
					approvalRequest: input.approvalRequest,
				}
			: input;
	await context.capabilities.updateTaskStatus(update, toolCallId);
	return { status: input.status };
}

async function createApprovalId(taskId: string, toolCallId: string) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(`${taskId}:${toolCallId}`),
	);
	return `task:${Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("")}`;
}
