// @vitest-environment node

import { describe, expect, it } from "vitest";
import { readAgentRuntimeConfiguration } from "../../../server/agent/configuration";

const commonEnvironment = {
	VITE_CONVEX_URL: "https://example.convex.cloud",
	AGENT_RUNTIME_SECRET: "runtime_secret_that_is_at_least_32_characters",
	OPENAI_API_KEY: "openai-test-key",
};

describe("agent runtime transport configuration", () => {
	it("keeps pull as the default transport with bounded local concurrency", () => {
		expect(readAgentRuntimeConfiguration(commonEnvironment)).toEqual({
			transport: "pull",
			convexUrl: commonEnvironment.VITE_CONVEX_URL,
			runtimeSecret: commonEnvironment.AGENT_RUNTIME_SECRET,
			openaiApiKey: commonEnvironment.OPENAI_API_KEY,
			executionTimeoutMs: 600_000,
			concurrency: 4,
		});
	});

	it("selects push without applying the pull concurrency setting", () => {
		expect(
			readAgentRuntimeConfiguration({
				...commonEnvironment,
				AGENT_RUN_TRANSPORT: "push",
				AGENT_RUN_PUSH_SIGNING_SECRET:
					"push_secret_that_is_at_least_32_characters",
				AGENT_RUN_CONCURRENCY: "invalid-but-irrelevant-for-push",
			}),
		).toEqual({
			transport: "push",
			convexUrl: commonEnvironment.VITE_CONVEX_URL,
			runtimeSecret: commonEnvironment.AGENT_RUNTIME_SECRET,
			openaiApiKey: commonEnvironment.OPENAI_API_KEY,
			executionTimeoutMs: 600_000,
			pushSigningSecret: "push_secret_that_is_at_least_32_characters",
		});
	});

	it("fails closed for an invalid transport or missing push secret", () => {
		expect(() =>
			readAgentRuntimeConfiguration({
				...commonEnvironment,
				AGENT_RUN_TRANSPORT: "automatic",
			}),
		).toThrow('must be either "pull" or "push"');
		expect(() =>
			readAgentRuntimeConfiguration({
				...commonEnvironment,
				AGENT_RUN_TRANSPORT: "push",
			}),
		).toThrow("configuration is incomplete");
	});

	it("fails closed for an invalid Convex deployment URL", () => {
		expect(() =>
			readAgentRuntimeConfiguration({
				...commonEnvironment,
				VITE_CONVEX_URL: "not-a-url",
			}),
		).toThrow("valid HTTP(S) URL");
	});
});
