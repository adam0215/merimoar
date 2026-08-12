import {
	hasToolCall,
	type LanguageModel,
	type ModelMessage,
	ToolLoopAgent,
} from "ai";
import type { BuiltInToolKey } from "./builtins/catalog";
import { createAgentTools } from "./custom-tools";
import prompt from "./prompts/agent-v1.md?raw";
import type { AgentContext, CustomToolDefinition } from "./types";

export type AgentToolObserver = {
	started(input: {
		toolCallId: string;
		toolName: string;
		input: unknown;
	}): Promise<void>;
	finished(input: {
		toolCallId: string;
		output:
			| { type: "tool-result"; output: unknown }
			| { type: "tool-error"; error: unknown };
		durationMs: number;
	}): Promise<void>;
};

export function createMerimoarAgent(input: {
	model: LanguageModel;
	context: AgentContext;
	customTools?: readonly CustomToolDefinition[];
	activeBuiltInTools?: readonly BuiltInToolKey[];
	toolObserver?: AgentToolObserver;
	prepareMessages?: (messages: ModelMessage[]) => Promise<ModelMessage[]>;
}) {
	const tools = createAgentTools(
		input.context,
		input.customTools ?? [],
		input.activeBuiltInTools,
	);
	const { prepareMessages, toolObserver } = input;
	return new ToolLoopAgent({
		id: "merimoar-agent-v1",
		model: input.model,
		instructions: prompt,
		allowSystemInMessages: true,
		stopWhen: hasToolCall("update_task_status"),
		tools,
		runtimeContext: input.context,
		prepareStep: prepareMessages
			? async ({ messages }) => ({
					messages: await prepareMessages(messages),
				})
			: undefined,
		onToolExecutionStart: toolObserver
			? ({ toolCall }) =>
					toolObserver.started({
						toolCallId: toolCall.toolCallId,
						toolName: toolCall.toolName,
						input: toolCall.input,
					})
			: undefined,
		onToolExecutionEnd: toolObserver
			? ({ toolCall, toolOutput, toolExecutionMs }) =>
					toolObserver.finished({
						toolCallId: toolCall.toolCallId,
						output:
							toolOutput.type === "tool-result"
								? {
										type: "tool-result",
										output: toolOutput.output,
									}
								: {
										type: "tool-error",
										error: toolOutput.error,
									},
						durationMs: toolExecutionMs,
					})
			: undefined,
	});
}
