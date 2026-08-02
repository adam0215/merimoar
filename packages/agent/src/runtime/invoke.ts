import type { LanguageModel } from "ai";
import { createMerimoarAgent } from "../agent";
import {
	AGENT_RUN_SHUTDOWN,
	type AgentContext,
	type AgentRuntimeAdapter,
	type ClaimedRun,
} from "../types";
import { CoalescedTextWriter } from "./coalesced-text-writer";
import {
	getDiagnosticErrorMessage,
	serializeDiagnosticValue,
} from "./diagnostics";
import { buildModelMessages } from "./transcript";

const LEASE_RENEWAL_INTERVAL_MS = 20_000;
const DEFAULT_EXECUTION_TIMEOUT_MS = 10 * 60_000;

export async function invokeAgentRun(input: {
	claim: ClaimedRun;
	runtime: AgentRuntimeAdapter;
	model: LanguageModel;
	executionTimeoutMs?: number;
	abortSignal?: AbortSignal;
}) {
	const executionTimeoutMs =
		input.executionTimeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS;
	if (
		!Number.isInteger(executionTimeoutMs) ||
		executionTimeoutMs < 1 ||
		executionTimeoutMs > 60 * 60_000
	) {
		throw new Error("Agent execution timeout must be 1 ms to 1 hour.");
	}

	const textWriters = new Map<string, CoalescedTextWriter>();
	const flushPendingText = async () => {
		await Promise.all(
			[...textWriters.values()].map((writer) => writer.flush()),
		);
	};
	const finishPendingText = async () => {
		await Promise.all(
			[...textWriters.values()].map((writer) => writer.finish()),
		);
	};
	let taskStatusSelected = false;
	const capabilities: AgentContext["capabilities"] = {
		...input.runtime,
		updateActivity: async (activity) => {
			await flushPendingText();
			await input.runtime.updateActivity(activity);
		},
		updateTaskStatus: async (update, toolCallId) => {
			await flushPendingText();
			const selectedStatus = await input.runtime.updateTaskStatus(
				update,
				toolCallId,
			);
			taskStatusSelected = true;
			return selectedStatus;
		},
	};
	const context: AgentContext = {
		taskId: input.claim.taskId,
		capabilities,
	};
	const abortController = new AbortController();
	let abortReason: unknown;
	const leaseTimer = setInterval(() => {
		void input.runtime.renewLease().catch((error: unknown) => {
			abortRun(error);
		});
	}, LEASE_RENEWAL_INTERVAL_MS);
	const abortRun = (reason: unknown) => {
		clearInterval(leaseTimer);
		abortReason ??= reason;
		abortController.abort(reason);
	};
	const abortFromCaller = () =>
		abortRun(input.abortSignal?.reason ?? new Error("Agent run stopped."));
	if (input.abortSignal?.aborted) abortFromCaller();
	else
		input.abortSignal?.addEventListener("abort", abortFromCaller, {
			once: true,
		});
	const deadlineTimer = setTimeout(() => {
		abortRun(new Error("Agent execution deadline exceeded."));
	}, executionTimeoutMs);
	const startedToolCalls = new Set<string>();

	const recordToolStart = async (toolCall: {
		toolCallId: string;
		toolName: string;
		input: unknown;
	}) => {
		if (startedToolCalls.has(toolCall.toolCallId)) return;
		startedToolCalls.add(toolCall.toolCallId);
		await flushPendingText();
		await input.runtime.recordToolStarted({
			toolCallId: toolCall.toolCallId,
			toolName: toolCall.toolName,
			inputJson: serializeDiagnosticValue(toolCall.input),
			summary: describeToolCall(toolCall.toolName),
		});
	};

	try {
		const transcript = await input.runtime.getTranscript();
		if (transcript.selectedStatusItemId) {
			await input.runtime.finishRun();
			return;
		}
		let latestSteeringSequence = getLatestSteeringSequence(
			transcript,
			input.claim.runId,
		);
		await capabilities.updateActivity({ title: "Started working" });
		const agent = createMerimoarAgent({
			model: input.model,
			context,
			prepareMessages: async (messages) => {
				const steeringMessages = await input.runtime.getSteeringMessages(
					latestSteeringSequence,
				);
				if (steeringMessages.length === 0) return messages;
				latestSteeringSequence = Math.max(
					...steeringMessages.map((message) => message.sequence),
				);
				return [
					...messages,
					...steeringMessages.map((message) => ({
						role: "user" as const,
						content: message.body,
					})),
				];
			},
			toolObserver: {
				started: recordToolStart,
				finished: async ({ toolCallId, output, durationMs }) => {
					await flushPendingText();
					await input.runtime.recordToolFinished({
						toolCallId,
						result:
							output.type === "tool-result"
								? {
										status: "completed",
										outputJson: serializeDiagnosticValue(output.output),
										durationMs,
									}
								: {
										status: "failed",
										error: getDiagnosticErrorMessage(output.error),
										durationMs,
									},
					});
				},
			},
		});
		const result = await agent.stream({
			messages: [
				{
					role: "system",
					content: `This task is anchored to case ID ${input.claim.anchorCaseId}. Use that exact ID when reading or changing the delegated case.`,
				},
				...buildModelMessages(transcript, input.claim.runId),
			],
			abortSignal: abortController.signal,
		});

		for await (const part of result.stream) {
			switch (part.type) {
				case "text-start": {
					textWriters.set(
						part.id,
						new CoalescedTextWriter(
							(body) => input.runtime.startAgentMessage(body),
							(messageItemId, body) =>
								input.runtime.updateAgentMessage(messageItemId, body),
						),
					);
					break;
				}
				case "text-delta":
					textWriters.get(part.id)?.append(part.text);
					break;
				case "text-end": {
					await textWriters.get(part.id)?.finish();
					textWriters.delete(part.id);
					break;
				}
				case "tool-call":
					await recordToolStart(part);
					break;
				case "tool-approval-request":
					await recordToolStart(part.toolCall);
					await flushPendingText();
					await input.runtime.recordToolApprovalRequest({
						toolCallId: part.toolCall.toolCallId,
						approvalId: part.approvalId,
						request: `Approve ${describeToolCall(part.toolCall.toolName).toLocaleLowerCase()}?`,
						...(part.signature ? { signature: part.signature } : {}),
					});
					break;
				case "error":
					throw part.error;
				case "abort":
					throw (
						abortReason ??
						abortController.signal.reason ??
						new Error(part.reason || "Agent run aborted")
					);
			}
		}
		await finishPendingText();

		const usage = await result.usage;
		await input.runtime.finishRun({
			...(usage.inputTokens === undefined
				? {}
				: { inputTokens: usage.inputTokens }),
			...(usage.outputTokens === undefined
				? {}
				: { outputTokens: usage.outputTokens }),
			...(usage.totalTokens === undefined
				? {}
				: { totalTokens: usage.totalTokens }),
		});
	} catch (error) {
		await Promise.allSettled([finishPendingText()]);
		if (abortReason === AGENT_RUN_SHUTDOWN) return;
		if (taskStatusSelected) {
			const [finalization] = await Promise.allSettled([
				input.runtime.finishRun(),
			]);
			if (finalization.status === "fulfilled") return;
			throwSanitizedBoundaryError(finalization.reason);
		}
		const [failure] = await Promise.allSettled([
			input.runtime.failRun(
				"Agent execution failed.",
				getDiagnosticErrorMessage(abortReason ?? error),
			),
		]);
		if (
			failure.status === "fulfilled" &&
			failure.value === "finalized_selected_status"
		) {
			return;
		}
		throwSanitizedBoundaryError(abortReason ?? error);
	} finally {
		clearInterval(leaseTimer);
		clearTimeout(deadlineTimer);
		input.abortSignal?.removeEventListener("abort", abortFromCaller);
	}
}

function getLatestSteeringSequence(
	transcript: Awaited<ReturnType<AgentRuntimeAdapter["getTranscript"]>>,
	runId: string,
) {
	let latestSequence = 0;
	for (const turn of transcript.turns) {
		for (const item of turn.items) {
			if (item.kind !== "member_message_steer" || item.runId !== runId) {
				continue;
			}
			latestSequence = Math.max(latestSequence, item.sequence);
		}
	}
	return latestSequence;
}

function throwSanitizedBoundaryError(error: unknown): never {
	throw new Error(getDiagnosticErrorMessage(error));
}

function describeToolCall(toolName: string) {
	const descriptions: Record<string, string> = {
		global_search: "Searching Merimoar",
		inspect_entity: "Inspecting an entity",
		inspect_contact: "Inspecting a contact",
		read_case: "Reading a case",
		create_case: "Creating a related case",
		update_case: "Updating a case",
		add_case_relation: "Adding a case relation",
		search_emails: "Searching organization email",
		read_email_thread: "Reading an email thread",
		update_activity: "Updating progress",
		update_task_status: "Updating the task status",
	};
	return descriptions[toolName] ?? "Using a Merimoar capability";
}
