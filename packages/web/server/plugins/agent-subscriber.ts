import {
	getDiagnosticErrorMessage,
	startAgentRunSubscriber,
} from "@merimoar/agent";
import { definePlugin } from "nitro";
import { createConvexAgentSubscriberHost } from "../agent/convex-runtime";

type AgentRunSubscriber = ReturnType<typeof startAgentRunSubscriber>;

const processState = globalThis as typeof globalThis & {
	merimoarAgentRunSubscriber?: AgentRunSubscriber;
};

export default definePlugin(async (nitro) => {
	await processState.merimoarAgentRunSubscriber?.stop();
	delete processState.merimoarAgentRunSubscriber;
	const reportError = (error: unknown) => {
		nitro.captureError?.(new Error(getDiagnosticErrorMessage(error)), {
			tags: ["agent-subscriber"],
		});
	};

	const convexUrl = process.env.VITE_CONVEX_URL;
	const runtimeSecret = process.env.AGENT_RUNTIME_SECRET;
	const openaiApiKey = process.env.OPENAI_API_KEY;
	if (!convexUrl || !runtimeSecret || runtimeSecret.length < 32 || !openaiApiKey)
		return;
	const concurrency = Number(process.env.AGENT_RUN_CONCURRENCY ?? 4);
	if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
		reportError(
			new Error("AGENT_RUN_CONCURRENCY must be an integer from 1 to 32."),
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
		reportError(
			new Error(
				"AGENT_RUN_EXECUTION_TIMEOUT_MS must be an integer from 1 to 3600000.",
			),
		);
		return;
	}

	let subscriber: AgentRunSubscriber;
	try {
		subscriber = startAgentRunSubscriber(
			createConvexAgentSubscriberHost(
				{ convexUrl, runtimeSecret, openaiApiKey, executionTimeoutMs },
				reportError,
			),
			{ concurrency },
		);
	} catch (error) {
		reportError(error);
		return;
	}
	processState.merimoarAgentRunSubscriber = subscriber;

	nitro.hooks.hook("close", async () => {
		if (processState.merimoarAgentRunSubscriber !== subscriber) return;
		delete processState.merimoarAgentRunSubscriber;
		await subscriber.stop();
	});
});
