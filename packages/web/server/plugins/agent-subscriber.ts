import { getDiagnosticErrorMessage, startAgentRunSubscriber } from "@merimoar/agent";
import { definePlugin } from "nitro";
import { createConvexAgentSubscriberHost } from "../agent/convex-runtime";
import { agentRuntimeProcessState as processState } from "../agent/runtime-state";

type AgentRunSubscriber = ReturnType<typeof startAgentRunSubscriber>;

export default definePlugin(async (nitro) => {
	await processState.merimoarAgentRunSubscriber?.stop();
	delete processState.merimoarAgentRunSubscriber;
	const captureError = (error: unknown) => {
		const errorMessage = getDiagnosticErrorMessage(error);
		nitro.captureError?.(new Error(errorMessage), {
			tags: ["agent-subscriber"],
		});
	};
	const reportStartupError = (error: unknown, configuration?: string) => {
		console.error("agent_runtime_not_started", {
			reason: configuration
				? "invalid_configuration"
				: "initialization_failed",
			...(configuration ? { configuration } : {}),
			errorMessage: getDiagnosticErrorMessage(error),
		});
		captureError(error);
	};

	const convexUrl = process.env.VITE_CONVEX_URL;
	const runtimeSecret = process.env.AGENT_RUNTIME_SECRET;
	const openaiApiKey = process.env.OPENAI_API_KEY;
	const missingConfiguration = [
		...(!convexUrl ? ["VITE_CONVEX_URL"] : []),
		...(!runtimeSecret ? ["AGENT_RUNTIME_SECRET"] : []),
		...(!openaiApiKey ? ["OPENAI_API_KEY"] : []),
	];
	if (!convexUrl || !runtimeSecret || !openaiApiKey) {
		console.warn("agent_runtime_not_started", {
			reason: "missing_configuration",
			missingConfiguration,
		});
		return;
	}
	if (runtimeSecret.length < 32) {
		reportStartupError(
			new Error("AGENT_RUNTIME_SECRET must contain at least 32 characters."),
			"AGENT_RUNTIME_SECRET",
		);
		return;
	}
	const concurrency = Number(process.env.AGENT_RUN_CONCURRENCY ?? 4);
	if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
		reportStartupError(
			new Error("AGENT_RUN_CONCURRENCY must be an integer from 1 to 32."),
			"AGENT_RUN_CONCURRENCY",
		);
		return;
	}
	const executionTimeoutMs = Number(
		process.env.AGENT_RUN_EXECUTION_TIMEOUT_MS ?? 600_000,
	);
	if (
		!Number.isInteger(executionTimeoutMs) ||
		executionTimeoutMs < 1 ||
		executionTimeoutMs > 3_600_000
	) {
		reportStartupError(
			new Error(
				"AGENT_RUN_EXECUTION_TIMEOUT_MS must be an integer from 1 to 3600000.",
			),
			"AGENT_RUN_EXECUTION_TIMEOUT_MS",
		);
		return;
	}

	let subscriber: AgentRunSubscriber;
	try {
		subscriber = startAgentRunSubscriber(
			createConvexAgentSubscriberHost(
				{ convexUrl, runtimeSecret, openaiApiKey, executionTimeoutMs },
				captureError,
			),
			{ concurrency },
		);
	} catch (error) {
		reportStartupError(error);
		return;
	}
	processState.merimoarAgentRunSubscriber = subscriber;
	console.info("agent_runtime_started", { concurrency, executionTimeoutMs });

	nitro.hooks.hook("close", async () => {
		if (processState.merimoarAgentRunSubscriber !== subscriber) return;
		delete processState.merimoarAgentRunSubscriber;
		await subscriber.stop();
	});
});
