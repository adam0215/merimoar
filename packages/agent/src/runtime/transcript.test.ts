import { describe, expect, it } from "vitest";
import { buildModelMessages } from "./transcript";

describe("buildModelMessages", () => {
	it("reconstructs tool calls and approval answers from normalized items", () => {
		const messages = buildModelMessages(
			{
				taskId: "task-1",
				turns: [
					{
						turnId: "turn-1",
						sequence: 1,
						items: [
							{
								kind: "member_message",
								body: "Handle this case.",
								sequence: 1,
							},
							{
								kind: "tool",
								_id: "tool-item-1",
								runId: "run-2",
								toolCallId: "tool-call-1",
								toolName: "external_action",
								inputJson: '{"caseId":"case-1"}',
								status: "approval_required",
								sequence: 2,
							},
							{
								kind: "approval",
								approvalId: "approval-1",
								approvalKind: "tool",
								toolItemId: "tool-item-1",
								signature: "signed-approval-request",
								request: "Approve the external action?",
								status: "approved",
								answerReason: "Verified by the case owner.",
								continuationRunId: "run-2",
								sequence: 3,
							},
						],
					},
				],
			},
			"run-2",
		);

		expect(messages).toEqual([
			{ role: "user", content: "Handle this case." },
			{
				role: "assistant",
				content: [
					{
						type: "tool-call",
						toolCallId: "tool-call-1",
						toolName: "external_action",
						input: { caseId: "case-1" },
					},
					{
						type: "tool-approval-request",
						approvalId: "approval-1",
						toolCallId: "tool-call-1",
						signature: "signed-approval-request",
					},
				],
			},
			{
				role: "tool",
				content: [
					{
						type: "tool-approval-response",
						approvalId: "approval-1",
						approved: true,
						reason: "Verified by the case owner.",
					},
				],
			},
		]);
	});

	it("batches mixed tool decisions into the final tool message and includes task decisions", () => {
		const messages = buildModelMessages(
			{
				taskId: "task-1",
				turns: [
					{
						turnId: "turn-1",
						sequence: 1,
						items: [
							{
								kind: "tool",
								_id: "tool-1",
								runId: "run-1",
								toolCallId: "call-1",
								toolName: "approved_action",
								inputJson: '{"value":"a"}',
								status: "approval_required",
								sequence: 1,
							},
							{
								kind: "approval",
								approvalId: "approval-1",
								approvalKind: "tool",
								toolItemId: "tool-1",
								request: "Approve A?",
								status: "approved",
								continuationRunId: "run-2",
								sequence: 2,
							},
							{
								kind: "tool",
								_id: "tool-2",
								runId: "run-1",
								toolCallId: "call-2",
								toolName: "denied_action",
								inputJson: '{"value":"b"}',
								status: "approval_required",
								sequence: 3,
							},
							{
								kind: "approval",
								approvalId: "approval-2",
								approvalKind: "tool",
								toolItemId: "tool-2",
								request: "Approve B?",
								status: "denied",
								answerReason: "B is unsafe.",
								continuationRunId: "run-2",
								sequence: 4,
							},
							{
								kind: "approval",
								approvalId: "task-approval",
								approvalKind: "task",
								request: "May the task close the case?",
								status: "denied",
								answerReason: "Keep it open.",
								continuationRunId: "run-2",
								sequence: 5,
							},
						],
					},
				],
			},
			"run-2",
		);

		expect(messages.at(-1)).toEqual({
			role: "tool",
			content: [
				{
					type: "tool-approval-response",
					approvalId: "approval-1",
					approved: true,
				},
				{
					type: "tool-approval-response",
					approvalId: "approval-2",
					approved: false,
					reason: "B is unsafe.",
				},
			],
		});
		expect(messages.at(-2)).toEqual({
			role: "user",
			content:
				"Task approval denied: May the task close the case?\nReason: Keep it open.",
		});
	});
});
