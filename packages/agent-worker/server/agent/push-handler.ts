import {
	createAgentRunPushHandler,
	getDiagnosticErrorMessage,
	type AgentRunPushHost,
} from "@merimoar/agent";
import {
	type AgentWorkerConfiguration,
	readAgentWorkerConfiguration,
} from "./configuration";
import { createConvexAgentPushHost } from "./convex-push";

type AgentWorkerLogger = Pick<Console, "info" | "warn" | "error">;

type AgentWorkerPushDependencies = {
	environment?: NodeJS.ProcessEnv;
	logger?: AgentWorkerLogger;
	createPushHost?: (
		configuration: AgentWorkerConfiguration,
		onError: (error: unknown) => void,
	) => AgentRunPushHost;
};

export async function handleAgentWorkerPushRequest(
	request: Request,
	deferExecution: (execution: Promise<void>) => void,
	dependencies: AgentWorkerPushDependencies = {},
) {
	const logger = dependencies.logger ?? console;
	let configuration: AgentWorkerConfiguration;
	try {
		configuration = readAgentWorkerConfiguration(dependencies.environment);
	} catch (error) {
		const configurationError = error as {
			configuration?: string;
			missingConfiguration?: string[];
		};
		logger.warn("agent_worker_unavailable", {
			reason: configurationError.missingConfiguration?.length
				? "missing_configuration"
				: "invalid_configuration",
			...(configurationError.configuration
				? { configuration: configurationError.configuration }
				: {}),
			...(configurationError.missingConfiguration?.length
				? { missingConfiguration: configurationError.missingConfiguration }
				: {}),
			errorMessage: getDiagnosticErrorMessage(error),
		});
		return new Response("Agent worker is unavailable", { status: 503 });
	}

	const reportError = (error: unknown) => {
		logger.error("agent_run_execution_failed", {
			errorMessage: getDiagnosticErrorMessage(error),
		});
	};
	const createPushHost =
		dependencies.createPushHost ?? createConvexAgentPushHost;
	const startedAt = performance.now();
	const response = await createAgentRunPushHandler(
		createPushHost(configuration, reportError),
		{
			signingSecret: configuration.pushSigningSecret,
			deferExecution,
		},
	)(request);
	const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
	if (response.status === 202) {
		logger.info("agent_push_accepted", { durationMs });
	} else if (response.status >= 500) {
		logger.warn("agent_push_retryable_failure", {
			status: response.status,
			durationMs,
		});
	}
	return response;
}
