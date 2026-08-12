export type AgentRuntimeConfiguration =
	| {
			transport: "pull";
			convexUrl: string;
			runtimeSecret: string;
			openaiApiKey: string;
			executionTimeoutMs: number;
			concurrency: number;
	  }
	| {
			transport: "push";
			convexUrl: string;
			runtimeSecret: string;
			openaiApiKey: string;
			executionTimeoutMs: number;
			pushSigningSecret: string;
	  };

export class AgentRuntimeConfigurationError extends Error {
	constructor(
		message: string,
		readonly configuration?: string,
		readonly missingConfiguration: string[] = [],
	) {
		super(message);
		this.name = "AgentRuntimeConfigurationError";
	}
}

export function readAgentRuntimeConfiguration(
	environment: NodeJS.ProcessEnv = process.env,
): AgentRuntimeConfiguration {
	const transport = environment.AGENT_RUN_TRANSPORT ?? "pull";
	if (transport !== "pull" && transport !== "push") {
		throw new AgentRuntimeConfigurationError(
			'AGENT_RUN_TRANSPORT must be either "pull" or "push".',
			"AGENT_RUN_TRANSPORT",
		);
	}
	const convexUrl = environment.VITE_CONVEX_URL;
	const runtimeSecret = environment.AGENT_RUNTIME_SECRET;
	const openaiApiKey = environment.OPENAI_API_KEY;
	const pushSigningSecret = environment.AGENT_RUN_PUSH_SIGNING_SECRET;
	const missingConfiguration = [
		...(!convexUrl ? ["VITE_CONVEX_URL"] : []),
		...(!runtimeSecret ? ["AGENT_RUNTIME_SECRET"] : []),
		...(!openaiApiKey ? ["OPENAI_API_KEY"] : []),
		...(transport === "push" && !pushSigningSecret
			? ["AGENT_RUN_PUSH_SIGNING_SECRET"]
			: []),
	];
	if (!convexUrl || !runtimeSecret || !openaiApiKey || missingConfiguration.length) {
		throw new AgentRuntimeConfigurationError(
			"Agent runtime configuration is incomplete.",
			undefined,
			missingConfiguration,
		);
	}
	requireConvexDeploymentUrl(convexUrl);
	if (runtimeSecret.length < 32) {
		throw new AgentRuntimeConfigurationError(
			"AGENT_RUNTIME_SECRET must contain at least 32 characters.",
			"AGENT_RUNTIME_SECRET",
		);
	}
	const executionTimeoutMs = Number(
		environment.AGENT_RUN_EXECUTION_TIMEOUT_MS ?? 600_000,
	);
	if (
		!Number.isInteger(executionTimeoutMs) ||
		executionTimeoutMs < 1 ||
		executionTimeoutMs > 3_600_000
	) {
		throw new AgentRuntimeConfigurationError(
			"AGENT_RUN_EXECUTION_TIMEOUT_MS must be an integer from 1 to 3600000.",
			"AGENT_RUN_EXECUTION_TIMEOUT_MS",
		);
	}

	if (transport === "push") {
		if (!pushSigningSecret || pushSigningSecret.length < 32) {
			throw new AgentRuntimeConfigurationError(
				"AGENT_RUN_PUSH_SIGNING_SECRET must contain at least 32 characters.",
				"AGENT_RUN_PUSH_SIGNING_SECRET",
			);
		}
		return {
			transport,
			convexUrl,
			runtimeSecret,
			openaiApiKey,
			executionTimeoutMs,
			pushSigningSecret,
		};
	}

	const concurrency = Number(environment.AGENT_RUN_CONCURRENCY ?? 4);
	if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
		throw new AgentRuntimeConfigurationError(
			"AGENT_RUN_CONCURRENCY must be an integer from 1 to 32.",
			"AGENT_RUN_CONCURRENCY",
		);
	}
	return {
		transport,
		convexUrl,
		runtimeSecret,
		openaiApiKey,
		executionTimeoutMs,
		concurrency,
	};
}

function requireConvexDeploymentUrl(value: string) {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new AgentRuntimeConfigurationError(
			"VITE_CONVEX_URL must be a valid HTTP(S) URL.",
			"VITE_CONVEX_URL",
		);
	}
	if (
		(url.protocol !== "https:" && url.protocol !== "http:") ||
		url.username ||
		url.password ||
		url.hash
	) {
		throw new AgentRuntimeConfigurationError(
			"VITE_CONVEX_URL must be a credential-free HTTP(S) URL.",
			"VITE_CONVEX_URL",
		);
	}
}
