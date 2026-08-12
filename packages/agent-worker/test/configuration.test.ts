// @vitest-environment node

import { describe, expect, it } from "vitest";
import { readAgentWorkerConfiguration } from "../server/agent/configuration";

const commonEnvironment = {
	CONVEX_URL: "https://example.convex.cloud",
	AGENT_RUNTIME_SECRET: "runtime_secret_that_is_at_least_32_characters",
	OPENAI_API_KEY: "openai-test-key",
	AGENT_RUN_PUSH_SIGNING_SECRET:
		"push_secret_that_is_at_least_32_characters",
};

describe("agent worker configuration", () => {
	it("loads the complete push-only worker configuration", () => {
		expect(readAgentWorkerConfiguration(commonEnvironment)).toEqual({
			convexUrl: commonEnvironment.CONVEX_URL,
			runtimeSecret: commonEnvironment.AGENT_RUNTIME_SECRET,
			openaiApiKey: commonEnvironment.OPENAI_API_KEY,
			executionTimeoutMs: 600_000,
			pushSigningSecret: commonEnvironment.AGENT_RUN_PUSH_SIGNING_SECRET,
		});
	});

	it("fails closed when the push secret is missing", () => {
		expect(() =>
			readAgentWorkerConfiguration({
				...commonEnvironment,
				AGENT_RUN_PUSH_SIGNING_SECRET: undefined,
			}),
		).toThrow("configuration is incomplete");
	});

	it("fails closed for an invalid Convex deployment URL", () => {
		expect(() =>
			readAgentWorkerConfiguration({
				...commonEnvironment,
				CONVEX_URL: "not-a-url",
			}),
		).toThrow("valid HTTP(S) URL");
	});
});
