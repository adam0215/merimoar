import { getDiagnosticErrorMessage, startAgentRunSubscriber } from "@merimoar/agent";
import { definePlugin } from "nitro";
import { readAgentRuntimeConfiguration } from "../agent/configuration";
import { createConvexAgentPullHost } from "../agent/convex-pull";
import { agentRuntimeProcessState as processState } from "../agent/runtime-state";

export default definePlugin(async (nitro) => {
	await processState.merimoarAgentRunSubscriber?.stop();
	delete processState.merimoarAgentRunSubscriber;
	delete processState.merimoarAgentRunTransport;
	const captureError = (error: unknown) => {
		const errorMessage = getDiagnosticErrorMessage(error);
		nitro.captureError?.(new Error(errorMessage), {
			tags: ["agent-runtime"],
		});
	};

	let configuration: ReturnType<typeof readAgentRuntimeConfiguration>;
	try {
		configuration = readAgentRuntimeConfiguration();
	} catch (error) {
		const configurationError = error as {
			configuration?: string;
			missingConfiguration?: string[];
		};
		console.warn("agent_runtime_not_started", {
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
		captureError(error);
		return;
	}

	if (configuration.transport === "push") {
		processState.merimoarAgentRunTransport = "push";
		console.info("agent_runtime_started", {
			transport: configuration.transport,
			executionTimeoutMs: configuration.executionTimeoutMs,
		});
		return;
	}

	let subscriber: ReturnType<typeof startAgentRunSubscriber>;
	try {
		subscriber = startAgentRunSubscriber(
			createConvexAgentPullHost(configuration, captureError),
			{ concurrency: configuration.concurrency },
		);
	} catch (error) {
		console.warn("agent_runtime_not_started", {
			reason: "initialization_failed",
			errorMessage: getDiagnosticErrorMessage(error),
		});
		captureError(error);
		return;
	}
	processState.merimoarAgentRunSubscriber = subscriber;
	processState.merimoarAgentRunTransport = "pull";
	console.info("agent_runtime_started", {
		transport: configuration.transport,
		concurrency: configuration.concurrency,
		executionTimeoutMs: configuration.executionTimeoutMs,
	});

	nitro.hooks.hook("close", async () => {
		if (processState.merimoarAgentRunSubscriber !== subscriber) return;
		delete processState.merimoarAgentRunSubscriber;
		delete processState.merimoarAgentRunTransport;
		await subscriber.stop();
	});
});
