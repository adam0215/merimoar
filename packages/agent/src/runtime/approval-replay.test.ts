import { jsonSchema, ToolLoopAgent, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { buildModelMessages } from "./transcript";

const zeroUsage = {
	inputTokens: {
		total: 0,
		noCache: 0,
		cacheRead: 0,
		cacheWrite: 0,
	},
	outputTokens: {
		total: 0,
		text: 0,
		reasoning: 0,
	},
};

describe("AI SDK 7 approval replay", () => {
	it("executes approved calls, skips denied calls, and replays a mixed batch", async () => {
		const approved = vi.fn<(input: { value: string }) => Promise<string>>(
			async (input) => input.value,
		);
		const denied = vi.fn<(input: { value: string }) => Promise<string>>(
			async (input) => input.value,
		);
		const model = new MockLanguageModelV4({
			doGenerate: {
				content: [{ type: "text", text: "Decisions applied." }],
				finishReason: { unified: "stop", raw: "stop" },
				usage: zeroUsage,
				warnings: [],
			},
		});
		const agent = new ToolLoopAgent({
			model,
			tools: {
				approved_action: tool({
					inputSchema: jsonSchema<{ value: string }>({
						type: "object",
						properties: { value: { type: "string" } },
						required: ["value"],
						additionalProperties: false,
					}),
					needsApproval: true,
					execute: approved,
				}),
				denied_action: tool({
					inputSchema: jsonSchema<{ value: string }>({
						type: "object",
						properties: { value: { type: "string" } },
						required: ["value"],
						additionalProperties: false,
					}),
					needsApproval: true,
					execute: denied,
				}),
			},
		});
		const transcript = {
			taskId: "task-1",
			turns: [
				{
					turnId: "turn-1",
					sequence: 1,
					items: [
						{
							kind: "member_message",
							body: "Apply the approved actions.",
							sequence: 1,
						},
						{
							kind: "tool",
							_id: "tool-1",
							runId: "source-run",
							toolCallId: "call-1",
							toolName: "approved_action",
							inputJson: '{"value":"approved"}',
							status: "approval_required",
							sequence: 2,
						},
						{
							kind: "approval",
							approvalId: "approval-1",
							approvalKind: "tool",
							toolItemId: "tool-1",
							request: "Approve?",
							status: "approved",
							continuationRunId: "continuation-run",
							sequence: 3,
						},
						{
							kind: "tool",
							_id: "tool-2",
							runId: "source-run",
							toolCallId: "call-2",
							toolName: "denied_action",
							inputJson: '{"value":"denied"}',
							status: "approval_required",
							sequence: 4,
						},
						{
							kind: "approval",
							approvalId: "approval-2",
							approvalKind: "tool",
							toolItemId: "tool-2",
							request: "Approve?",
							status: "denied",
							continuationRunId: "continuation-run",
							sequence: 5,
						},
					],
				},
			],
		} satisfies Parameters<typeof buildModelMessages>[0];
		const messages = buildModelMessages(transcript, "continuation-run");

		await agent.generate({ messages });

		expect(approved).toHaveBeenCalledWith(
			{ value: "approved" },
			expect.objectContaining({ toolCallId: "call-1" }),
		);
		expect(denied).not.toHaveBeenCalled();
		expect(model.doGenerateCalls).toHaveLength(1);

		const laterMessages = buildModelMessages(transcript, "later-run");
		expect(laterMessages).toEqual([
			{ role: "user", content: "Apply the approved actions." },
		]);
		await agent.generate({ messages: laterMessages });
		expect(approved).toHaveBeenCalledTimes(1);
		expect(denied).not.toHaveBeenCalled();
	});

	it("replays only the new decision after a failed continuation retires its assigned batch", async () => {
		const oldApproved = vi.fn<() => Promise<string>>(async () => "old");
		const oldDenied = vi.fn<() => Promise<string>>(async () => "denied");
		const newlyApproved = vi.fn<() => Promise<string>>(async () => "new");
		const model = new MockLanguageModelV4({
			doGenerate: {
				content: [{ type: "text", text: "New decision applied." }],
				finishReason: { unified: "stop", raw: "stop" },
				usage: zeroUsage,
				warnings: [],
			},
		});
		const inputSchema = jsonSchema<Record<string, never>>({
			type: "object",
			properties: {},
			additionalProperties: false,
		});
		const agent = new ToolLoopAgent({
			model,
			tools: {
				old_approved: tool({
					inputSchema,
					needsApproval: true,
					execute: oldApproved,
				}),
				old_denied: tool({
					inputSchema,
					needsApproval: true,
					execute: oldDenied,
				}),
				new_approved: tool({
					inputSchema,
					needsApproval: true,
					execute: newlyApproved,
				}),
			},
		});
		const approvalItems = [
			{
				toolId: "old-approved-tool",
				toolCallId: "old-approved-call",
				toolName: "old_approved",
				approvalId: "old-approved",
				status: "approved" as const,
				continuationRunId: "failed-continuation",
				consumedAt: 100,
			},
			{
				toolId: "old-denied-tool",
				toolCallId: "old-denied-call",
				toolName: "old_denied",
				approvalId: "old-denied",
				status: "denied" as const,
				continuationRunId: "failed-continuation",
				consumedAt: 100,
			},
			{
				toolId: "new-tool",
				toolCallId: "new-call",
				toolName: "new_approved",
				approvalId: "new-approved",
				status: "approved" as const,
				continuationRunId: "next-continuation",
			},
		];
		const transcript = {
			taskId: "task-1",
			turns: [
				{
					turnId: "turn-1",
					sequence: 1,
					items: [
						{
							kind: "member_message",
							body: "Apply only decisions assigned to this continuation.",
							sequence: 1,
						},
						...approvalItems.flatMap((item, index) => [
							{
								kind: "tool" as const,
								_id: item.toolId,
								runId: "source-run",
								toolCallId: item.toolCallId,
								toolName: item.toolName,
								inputJson: "{}",
								status: "approval_required" as const,
								sequence: index * 2 + 2,
							},
							{
								kind: "approval" as const,
								approvalId: item.approvalId,
								approvalKind: "tool" as const,
								toolItemId: item.toolId,
								request: "Approve?",
								status: item.status,
								continuationRunId: item.continuationRunId,
								...("consumedAt" in item
									? { consumedAt: item.consumedAt }
									: {}),
								sequence: index * 2 + 3,
							},
						]),
					],
				},
			],
		} satisfies Parameters<typeof buildModelMessages>[0];

		await agent.generate({
			messages: buildModelMessages(transcript, "next-continuation"),
		});
		expect(oldApproved).not.toHaveBeenCalled();
		expect(oldDenied).not.toHaveBeenCalled();
		expect(newlyApproved).toHaveBeenCalledOnce();

		await agent.generate({
			messages: buildModelMessages(transcript, "later-member-turn"),
		});
		expect(newlyApproved).toHaveBeenCalledOnce();
	});
});
