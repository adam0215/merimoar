import type { startAgentRunSubscriber } from "@merimoar/agent";

type AgentRunSubscriber = ReturnType<typeof startAgentRunSubscriber>;

export const agentRuntimeProcessState = globalThis as typeof globalThis & {
	merimoarAgentRunSubscriber?: AgentRunSubscriber;
	merimoarAgentRunTransport?: "pull" | "push";
};

export function isAgentRuntimeAvailable() {
	return agentRuntimeProcessState.merimoarAgentRunTransport !== undefined;
}
