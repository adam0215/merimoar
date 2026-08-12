import {
	createAgentRunPushHandler,
	getDiagnosticErrorMessage,
} from "@merimoar/agent";
import { createFileRoute } from "@tanstack/react-router";
import { getBackgroundExecutionRegistrar } from "../../../../server/agent/background-execution";
import { readAgentRuntimeConfiguration } from "../../../../server/agent/configuration";
import { createConvexAgentPushHost } from "../../../../server/agent/convex-push";

export const Route = createFileRoute("/api/agent-runs/push")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				let configuration: ReturnType<typeof readAgentRuntimeConfiguration>;
				try {
					configuration = readAgentRuntimeConfiguration();
				} catch {
					return new Response("Agent push runtime is unavailable", {
						status: 503,
					});
				}
				if (configuration.transport !== "push") {
					return new Response("Not found", { status: 404 });
				}
				const deferExecution = getBackgroundExecutionRegistrar(request);
				if (!deferExecution) {
					return new Response(
						"Agent push background execution is unavailable",
						{ status: 503 },
					);
				}
				const reportError = (error: unknown) => {
					console.error("agent_push_runtime_error", {
						errorMessage: getDiagnosticErrorMessage(error),
					});
				};
				return await createAgentRunPushHandler(
					createConvexAgentPushHost(configuration, reportError),
					{
						signingSecret: configuration.pushSigningSecret,
						deferExecution,
					},
				)(request);
			},
		},
	},
});
