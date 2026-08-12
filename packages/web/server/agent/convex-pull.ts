import type { AgentRunSubscriberHost } from "@merimoar/agent";
import { api } from "@merimoar/convex/api";
import type { Id } from "@merimoar/convex/data-model";
import { ConvexClient, type ConnectionState } from "convex/browser";
import {
	type AgentInvocationConfiguration,
	createConvexAgentRunInvoker,
} from "./convex-runtime";

const RUN_LEASE_DURATION_MS = 60_000;

export function createConvexAgentPullHost(
	configuration: AgentInvocationConfiguration & { convexUrl: string },
	onError: (error: unknown) => void,
): AgentRunSubscriberHost {
	const client = new ConvexClient(configuration.convexUrl, { logger: false });
	const invokeRun = createConvexAgentRunInvoker(client, configuration);

	return {
		subscribeToRunnableRuns(onSnapshot, onSubscriptionError) {
			let wasConnected: boolean | undefined;
			let previousRetryCount = 0;
			const reportConnectionState = (state: ConnectionState) => {
				if (state.isWebSocketConnected && wasConnected !== true) {
					console.info(
						state.connectionCount > 1
							? "agent_subscription_reconnected"
							: "agent_subscription_connected",
						{ connectionCount: state.connectionCount },
					);
				} else if (!state.isWebSocketConnected && wasConnected === true) {
					console.warn("agent_subscription_disconnected", {
						connectionCount: state.connectionCount,
					});
				}
				if (
					!state.isWebSocketConnected &&
					state.connectionRetries > previousRetryCount
				) {
					console.warn("agent_subscription_reconnect_attempt", {
						attempt: state.connectionRetries,
					});
				}
				wasConnected = state.isWebSocketConnected;
				previousRetryCount = state.connectionRetries;
			};
			const unsubscribeFromConnectionState =
				client.subscribeToConnectionState(reportConnectionState);
			reportConnectionState(client.connectionState());
			const unsubscribeFromRuns = client.onUpdate(
				api.agent.runtime.observeNextQueuedRun,
				{ runtimeSecret: configuration.runtimeSecret },
				onSnapshot,
				onSubscriptionError,
			);
			return () => {
				unsubscribeFromRuns();
				unsubscribeFromConnectionState();
			};
		},
		async claimNextRun(claimToken) {
			const claim = await client.mutation(api.agent.runtime.claimNextRun, {
				runtimeSecret: configuration.runtimeSecret,
				claimToken,
				leaseDurationMs: RUN_LEASE_DURATION_MS,
			});
			return claim ? { ...claim, claimToken } : null;
		},
		invokeRun,
		async relinquishRun(claim) {
			await client.mutation(api.agent.runtime.relinquishRun, {
				runtimeSecret: configuration.runtimeSecret,
				runId: claim.runId as Id<"agentRuns">,
				claimToken: claim.claimToken,
			});
		},
		close() {
			return client.close();
		},
		onError,
	};
}
