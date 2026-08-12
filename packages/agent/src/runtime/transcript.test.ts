import { describe, expect, it } from "vitest";
import {
	buildModelMessages,
	INBOUND_EMAIL_STEERING_SOURCE,
} from "./transcript";

describe("buildModelMessages", () => {
	it("replays long and credential-like tool values without changing them", () => {
		const body = `Authorization: Bearer model-value\n${"x".repeat(5_000)}`;
		const output = {
			body: `api_key=tool-value\n${"y".repeat(5_000)}`,
		};
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
								_id: "tool-item-1",
								runId: "run-1",
								toolCallId: "tool-call-1",
								toolName: "external_action",
								inputJson: JSON.stringify({ body }),
								status: "completed",
								outputJson: JSON.stringify(output),
								sequence: 1,
							},
						],
					},
				],
			},
			"run-2",
		);

		expect(messages).toEqual([
			{
				role: "assistant",
				content: [
					{
						type: "tool-call",
						toolCallId: "tool-call-1",
						toolName: "external_action",
						input: { body },
					},
				],
			},
			{
				role: "tool",
				content: [
					{
						type: "tool-result",
						toolCallId: "tool-call-1",
						toolName: "external_action",
						output: { type: "json", value: output },
					},
				],
			},
		]);
	});

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
								continuationRunId: "run-2",
								sequence: 4,
							},
							{
								kind: "approval",
								approvalId: "task-approval",
								approvalKind: "task",
								request: "May the task close the case?",
								status: "denied",
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
				},
			],
		});
		expect(messages.at(-2)).toEqual({
			role: "user",
			content: "Task approval denied: May the task close the case?",
		});
	});

	it("replays system invalidation as a declined tool approval with a derived reason", () => {
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
								_id: "tool-email",
								runId: "run-1",
								toolCallId: "call-email",
								toolName: "send_email",
								inputJson: '{"threadId":"thread-1","body":"Reply"}',
								status: "approval_required",
								sequence: 1,
							},
							{
								kind: "approval",
								approvalId: "approval-email",
								approvalKind: "tool",
								toolItemId: "tool-email",
								request: "Approve this email reply?",
								status: "invalidated",
								invalidationCause: {
									kind: "inbound_email_received",
									messageId: "message-2",
								},
								continuationRunId: "run-2",
								sequence: 2,
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
					approvalId: "approval-email",
					approved: false,
					reason:
						"A new email arrived in the thread. Read the thread again before proposing another reply.",
				},
			],
		});
	});

	it("keeps inbound email batches in their original transcript positions", () => {
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
								kind: "system_message",
								body: "First email batch",
								source: INBOUND_EMAIL_STEERING_SOURCE,
								runId: "run-1",
								inboundEmailMessageCount: 1,
								sequence: 2,
							},
							{
								kind: "agent_message",
								body: "I handled the first email.",
								sequence: 3,
							},
							{
								kind: "system_message",
								body: "Second email batch",
								source: INBOUND_EMAIL_STEERING_SOURCE,
								runId: "run-1",
								inboundEmailMessageCount: 1,
								sequence: 4,
							},
						],
					},
				],
			},
			"run-1",
		);

		expect(messages).toEqual([
			{ role: "user", content: "Handle this case." },
			{ role: "user", content: "First email batch" },
			{ role: "assistant", content: "I handled the first email." },
			{ role: "user", content: "Second email batch" },
		]);
	});
});
