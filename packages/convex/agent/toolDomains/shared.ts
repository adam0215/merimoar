import { ConvexError, v } from "convex/values";

export const runtimeArgs = {
	runtimeSecret: v.string(),
	runId: v.id("agentRuns"),
	claimToken: v.string(),
};

export const mutatingRuntimeArgs = {
	...runtimeArgs,
	toolCallId: v.string(),
};

export function invalidAgentTool(message: string) {
	return new ConvexError({ code: "INVALID_AGENT_TOOL_INPUT", message });
}
