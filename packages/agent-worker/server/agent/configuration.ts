export type AgentWorkerConfiguration = {
	convexUrl: string;
	runtimeSecret: string;
	openaiApiKey: string;
	executionTimeoutMs: number;
	pushSigningSecret: string;
};

class AgentWorkerConfigurationError extends Error {
	constructor(
		message: string,
		readonly configuration?: string,
		readonly missingConfiguration: string[] = [],
	) {
		super(message);
		this.name = "AgentWorkerConfigurationError";
	}
}

export function readAgentWorkerConfiguration(
	environment: NodeJS.ProcessEnv = process.env,
): AgentWorkerConfiguration {
	const convexUrl = environment.CONVEX_URL;
	const runtimeSecret = environment.AGENT_RUNTIME_SECRET;
	const openaiApiKey = environment.OPENAI_API_KEY;
	const pushSigningSecret = environment.AGENT_RUN_PUSH_SIGNING_SECRET;
	const missingConfiguration = [
		...(!convexUrl ? ["CONVEX_URL"] : []),
		...(!runtimeSecret ? ["AGENT_RUNTIME_SECRET"] : []),
		...(!openaiApiKey ? ["OPENAI_API_KEY"] : []),
		...(!pushSigningSecret ? ["AGENT_RUN_PUSH_SIGNING_SECRET"] : []),
	];
	if (
		!convexUrl ||
		!runtimeSecret ||
		!openaiApiKey ||
		!pushSigningSecret ||
		missingConfiguration.length > 0
	) {
		throw new AgentWorkerConfigurationError(
			"Agent worker configuration is incomplete.",
			undefined,
			missingConfiguration,
		);
	}
	requireConvexDeploymentUrl(convexUrl);
	requireSecret(runtimeSecret, "AGENT_RUNTIME_SECRET");
	requireSecret(pushSigningSecret, "AGENT_RUN_PUSH_SIGNING_SECRET");

	const executionTimeoutMs = Number(
		environment.AGENT_RUN_EXECUTION_TIMEOUT_MS ?? 600_000,
	);
	if (
		!Number.isInteger(executionTimeoutMs) ||
		executionTimeoutMs < 1 ||
		executionTimeoutMs > 3_600_000
	) {
		throw new AgentWorkerConfigurationError(
			"AGENT_RUN_EXECUTION_TIMEOUT_MS must be an integer from 1 to 3600000.",
			"AGENT_RUN_EXECUTION_TIMEOUT_MS",
		);
	}

	return {
		convexUrl,
		runtimeSecret,
		openaiApiKey,
		executionTimeoutMs,
		pushSigningSecret,
	};
}

function requireSecret(secret: string, name: string) {
	if (secret.length < 32) {
		throw new AgentWorkerConfigurationError(
			`${name} must contain at least 32 characters.`,
			name,
		);
	}
}

function requireConvexDeploymentUrl(value: string) {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new AgentWorkerConfigurationError(
			"CONVEX_URL must be a valid HTTP(S) URL.",
			"CONVEX_URL",
		);
	}
	if (
		(url.protocol !== "https:" && url.protocol !== "http:") ||
		url.username ||
		url.password ||
		url.hash
	) {
		throw new AgentWorkerConfigurationError(
			"CONVEX_URL must be a credential-free HTTP(S) URL.",
			"CONVEX_URL",
		);
	}
}
