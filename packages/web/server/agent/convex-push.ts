import type { AgentRunPushHost } from "@merimoar/agent";
import { api } from "@merimoar/convex/api";
import type { Id } from "@merimoar/convex/data-model";
import { ConvexHttpClient } from "convex/browser";
import {
	type AgentInvocationConfiguration,
	createConvexAgentRunInvoker,
} from "./convex-runtime";

const RUN_LEASE_DURATION_MS = 60_000;

export function createConvexAgentPushHost(
	configuration: AgentInvocationConfiguration & { convexUrl: string },
	onError: (error: unknown) => void,
): AgentRunPushHost {
	const client = new ConvexHttpClient(configuration.convexUrl);
	const invokeRun = createConvexAgentRunInvoker(client, configuration);
	return {
		async claimRun(runId, leaseGeneration, claimToken) {
			const claim = await client.mutation(api.agent.runtime.claimRun, {
				runtimeSecret: configuration.runtimeSecret,
				runId: runId as Id<"agentRuns">,
				leaseGeneration,
				claimToken,
				leaseDurationMs: RUN_LEASE_DURATION_MS,
			});
			return claim ? { ...claim, claimToken } : null;
		},
		invokeRun,
		onError,
	};
}
