import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { AGENT_RUN_SHUTDOWN, type AgentRuntimeAdapter } from "../types";
import { invokeAgentRun } from "./invoke";

const usage = {
	inputTokens: {
		total: 10,
		noCache: 10,
		cacheRead: 0,
		cacheWrite: 0,
	},
	outputTokens: {
		total: 4,
		text: 4,
		reasoning: 0,
	},
};

describe("invokeAgentRun", () => {
	it("runs ToolLoopAgent with a fake model, streams text, tools, and completion", async () => {
		const model = new MockLanguageModelV4({
			doStream: [
				{
					stream: simulateReadableStream({
						chunks: [
							{ type: "stream-start", warnings: [] },
							{ type: "text-start", id: "text-before-tool" },
							{
								type: "text-delta",
								id: "text-before-tool",
								delta: "I found the cause.",
							},
							{
								type: "tool-call",
								toolCallId: "activity-call",
								toolName: "update_activity",
								input: JSON.stringify({
									title: "Verifying the resolution",
									detail: "Checking the evidence before finalizing.",
								}),
							},
							{ type: "text-end", id: "text-before-tool" },
							{
								type: "finish",
								usage,
								finishReason: {
									unified: "tool-calls",
									raw: "tool-calls",
								},
							},
						],
					}),
				},
				{
					stream: simulateReadableStream({
						chunks: [
							{ type: "stream-start", warnings: [] },
							{ type: "text-start", id: "text-before-status" },
							{
								type: "text-delta",
								id: "text-before-status",
								delta: "The evidence is verified.",
							},
							{
								type: "tool-call",
								toolCallId: "status-call",
								toolName: "update_task_status",
								input: JSON.stringify({
									status: "completed",
									result: "Resolved the case and documented the decision.",
								}),
							},
							{ type: "text-end", id: "text-before-status" },
							{
								type: "finish",
								usage,
								finishReason: {
									unified: "tool-calls",
									raw: "tool-calls",
								},
							},
						],
					}),
				},
			],
		});
		const updates: string[] = [];
		const events: string[] = [];
		const finishRun = vi.fn<AgentRuntimeAdapter["finishRun"]>(async () => {
			events.push("finish");
		});
		let messageNumber = 0;
		let steeringCheckCount = 0;
		const runtime = createMinimalRuntime({
			getTranscript: async () => ({
				taskId: "task-1",
				turns: [
					{
						turnId: "turn-1",
						sequence: 1,
						items: [
							{
								kind: "member_message",
								body: "Resolve the case.",
								sequence: 1,
							},
						],
					},
				],
			}),
			getSteeringMessages: async () => {
				steeringCheckCount += 1;
				if (steeringCheckCount !== 2) return [];
				return [
					{
						body: "Also verify the related email before finishing.",
						sequence: 2,
					},
				];
			},
			updateActivity: async ({ title }) => {
				events.push(`activity:${title}`);
			},
			updateTaskStatus: async (update) => update,
			startAgentMessage: async (body) => {
				updates.push(body);
				events.push(`text:${body}`);
				return `message-${++messageNumber}`;
			},
			updateAgentMessage: async (_itemId, body) => {
				updates.push(body);
				events.push(`text:${body}`);
			},
			recordToolStarted: async ({ toolName }) => {
				events.push(`tool-start:${toolName}`);
			},
			recordToolFinished: async () => {
				events.push("tool-finish");
			},
			finishRun,
		});

		await invokeAgentRun({
			claim: createClaim(),
			runtime,
			model,
		});

		expect(updates).toEqual([
			"I found the cause.",
			"The evidence is verified.",
		]);
		expect(events.indexOf("text:I found the cause.")).toBeLessThan(
			events.indexOf("tool-start:update_activity"),
		);
		expect(events.indexOf("text:I found the cause.")).toBeLessThan(
			events.indexOf("activity:Verifying the resolution"),
		);
		expect(events.indexOf("text:The evidence is verified.")).toBeLessThan(
			events.indexOf("tool-start:update_task_status"),
		);
		expect(finishRun).toHaveBeenCalledWith({
			inputTokens: 20,
			outputTokens: 8,
			totalTokens: 28,
		});
		expect(model.doStreamCalls).toHaveLength(2);
		expect(JSON.stringify(model.doStreamCalls[0])).toContain(
			"This task is anchored to case ID case-1.",
		);
		expect(JSON.stringify(model.doStreamCalls[1])).toContain(
			"Also verify the related email before finishing.",
		);
	});

	it("never returns or persists a raw provider failure", async () => {
		const model = new MockLanguageModelV4({
			doStream: {
				stream: simulateReadableStream({
					chunks: [
						{ type: "stream-start", warnings: [] },
						{
							type: "error",
							error: new Error(
								"Provider https://user:password@provider.test failed with api_key=private-key",
							),
						},
					],
				}),
			},
		});
		const failRun = vi.fn<AgentRuntimeAdapter["failRun"]>(async () => "failed");
		const runtime = createMinimalRuntime({ failRun });

		const invocation = invokeAgentRun({
			claim: createClaim(),
			runtime,
			model,
		});

		await expect(invocation).rejects.toThrow(
			"Provider https://[REDACTED]@provider.test failed with api_key=[REDACTED]",
		);
		expect(failRun).toHaveBeenCalledWith(
			"Agent execution failed.",
			"Provider https://[REDACTED]@provider.test failed with api_key=[REDACTED]",
		);
	});

	it("finalizes a durable selected status when its commit response is lost", async () => {
		const model = new MockLanguageModelV4({
			doStream: {
				stream: simulateReadableStream({
					chunks: [
						{ type: "stream-start", warnings: [] },
						{
							type: "tool-call",
							toolCallId: "durable-status",
							toolName: "update_task_status",
							input: JSON.stringify({
								status: "completed",
								result: "The durable result wins.",
							}),
						},
						{
							type: "finish",
							usage,
							finishReason: {
								unified: "tool-calls",
								raw: "tool-calls",
							},
						},
					],
				}),
			},
		});
		const updateTaskStatus = vi.fn<AgentRuntimeAdapter["updateTaskStatus"]>(
			async () => {
				throw new Error("The status committed but its response was lost.");
			},
		);
		const finishRun = vi.fn<AgentRuntimeAdapter["finishRun"]>(async () => {});
		const failRun = vi.fn<AgentRuntimeAdapter["failRun"]>(
			async () => "finalized_selected_status",
		);

		await expect(
			invokeAgentRun({
				claim: createClaim(),
				runtime: createMinimalRuntime({
					updateTaskStatus,
					finishRun,
					failRun,
				}),
				model,
			}),
		).resolves.toBeUndefined();

		expect(updateTaskStatus).toHaveBeenCalledOnce();
		expect(finishRun).toHaveBeenCalledOnce();
		expect(failRun).not.toHaveBeenCalled();
	});

	it("never creates an empty message item for a no-delta or immediate-error stream", async () => {
		for (const chunks of [
			[
				{ type: "stream-start" as const, warnings: [] },
				{ type: "text-start" as const, id: "empty" },
				{ type: "text-end" as const, id: "empty" },
				{ type: "error" as const, error: new Error("No text") },
			],
			[
				{ type: "stream-start" as const, warnings: [] },
				{ type: "error" as const, error: new Error("Immediate failure") },
			],
		]) {
			const startAgentMessage = vi.fn<(body: string) => Promise<string>>(
				async (_body) => "message-1",
			);
			const runtime = createMinimalRuntime({ startAgentMessage });
			const model = new MockLanguageModelV4({
				doStream: {
					stream: simulateReadableStream({ chunks }),
				},
			});

			await expect(
				invokeAgentRun({
					claim: createClaim(),
					runtime,
					model,
				}),
			).rejects.toThrow(/No text|Immediate failure/);
			expect(startAgentMessage).not.toHaveBeenCalled();
		}
	});

	it("aborts a hung local provider stream at the configured deadline", async () => {
		const failRun = vi.fn<AgentRuntimeAdapter["failRun"]>(async () => "failed");
		const runtime = createMinimalRuntime({ failRun });
		const model = new MockLanguageModelV4({
			doStream: async (options) => ({
				stream: new ReadableStream({
					start(controller) {
						controller.enqueue({ type: "stream-start", warnings: [] });
						options.abortSignal?.addEventListener(
							"abort",
							() => {
								controller.enqueue({
									type: "error",
									error: options.abortSignal?.reason,
								});
								controller.close();
							},
							{ once: true },
						);
					},
				}),
			}),
		});

		await expect(
			invokeAgentRun({
				claim: createClaim(),
				runtime,
				model,
				executionTimeoutMs: 5,
			}),
		).rejects.toThrow("Agent execution deadline exceeded");
		expect(failRun).toHaveBeenCalledWith(
			"Agent execution failed.",
			"Agent execution deadline exceeded.",
		);
	});

	it("leaves a run retryable when the subscriber shuts down", async () => {
		const failRun = vi.fn<AgentRuntimeAdapter["failRun"]>(async () => "failed");
		const finishRun = vi.fn<AgentRuntimeAdapter["finishRun"]>(async () => {});
		const runtime = createMinimalRuntime({ failRun, finishRun });
		const abortController = new AbortController();
		let streamStarted: () => void = () => {};
		const started = new Promise<void>((resolve) => {
			streamStarted = resolve;
		});
		const model = new MockLanguageModelV4({
			doStream: async (options) => ({
				stream: new ReadableStream({
					start(controller) {
						controller.enqueue({ type: "stream-start", warnings: [] });
						streamStarted();
						options.abortSignal?.addEventListener(
							"abort",
							() => {
								controller.enqueue({
									type: "error",
									error: options.abortSignal?.reason,
								});
								controller.close();
							},
							{ once: true },
						);
					},
				}),
			}),
		});

		const invocation = invokeAgentRun({
			claim: createClaim(),
			runtime,
			model,
			abortSignal: abortController.signal,
		});
		await started;
		abortController.abort(AGENT_RUN_SHUTDOWN);
		await invocation;

		expect(failRun).not.toHaveBeenCalled();
		expect(finishRun).not.toHaveBeenCalled();
	});

	it("finalizes a status-tool result recovered from the durable ledger", async () => {
		const finishRun = vi.fn<AgentRuntimeAdapter["finishRun"]>(async () => {});
		const updateActivity = vi.fn<AgentRuntimeAdapter["updateActivity"]>(
			async () => {},
		);
		const runtime = createMinimalRuntime({
			finishRun,
			updateActivity,
			getTranscript: async () => ({
				taskId: "task-1",
				selectedStatusItemId: "status-item",
				turns: [
					{
						turnId: "turn-1",
						sequence: 1,
						items: [
							{
								kind: "tool",
								_id: "status-item",
								runId: "run-1",
								toolCallId: "status-call",
								toolName: "update_task_status",
								inputJson: '{"status":"completed"}',
								status: "completed",
								outputJson:
									'{"status":"completed","result":"The durable result."}',
								sequence: 1,
							},
						],
					},
				],
			}),
		});
		const model = new MockLanguageModelV4({
			doStream: {
				stream: simulateReadableStream({
					chunks: [{ type: "stream-start", warnings: [] }],
				}),
			},
		});

		await invokeAgentRun({ claim: createClaim(), runtime, model });

		expect(finishRun).toHaveBeenCalledOnce();
		expect(finishRun).toHaveBeenCalledWith();
		expect(updateActivity).not.toHaveBeenCalled();
		expect(model.doStreamCalls).toHaveLength(0);
	});
});

function createClaim() {
	return {
		runId: "run-1",
		turnId: "turn-1",
		taskId: "task-1",
		anchorCaseId: "case-1",
		agentKey: "agentV1",
		claimToken: "claim-1",
	};
}

function createMinimalRuntime(
	overrides: Partial<AgentRuntimeAdapter> = {},
): AgentRuntimeAdapter {
	return {
		getTranscript: async () => ({
			taskId: "task-1",
			turns: [
				{
					turnId: "turn-1",
					sequence: 1,
					items: [
						{
							kind: "member_message",
							body: "Inspect the case.",
							sequence: 1,
						},
					],
				},
			],
		}),
		getSteeringMessages: async () => [],
		renewLease: async () => {},
		updateActivity: async () => {},
		updateTaskStatus: async (update) => update,
		startAgentMessage: async () => "message-1",
		updateAgentMessage: async () => {},
		recordToolStarted: async () => {},
		recordToolFinished: async () => {},
		recordToolApprovalRequest: async () => {},
		finishRun: async () => {},
		failRun: async () => "failed",
		search: async () => [],
		inspectEntity: async () => null,
		inspectContact: async () => null,
		readCase: async () => null,
		createCase: async () => null,
		updateCase: async () => null,
		addCaseRelation: async () => null,
		searchEmails: async () => [],
		readEmailThread: async () => null,
		...overrides,
	};
}
