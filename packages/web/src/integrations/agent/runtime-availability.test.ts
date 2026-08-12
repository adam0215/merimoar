import { afterEach, describe, expect, test } from "vitest";
import {
	agentRuntimeProcessState,
	isAgentRuntimeAvailable,
} from "../../../server/agent/runtime-state.ts";

describe("agent runtime availability", () => {
	afterEach(() => {
		delete agentRuntimeProcessState.merimoarAgentRunSubscriber;
		delete agentRuntimeProcessState.merimoarAgentRunTransport;
	});

	test("is unavailable without a running subscriber", () => {
		delete agentRuntimeProcessState.merimoarAgentRunSubscriber;
		delete agentRuntimeProcessState.merimoarAgentRunTransport;

		expect(isAgentRuntimeAvailable()).toBe(false);
	});

	test("is available while the subscriber is running", () => {
		agentRuntimeProcessState.merimoarAgentRunTransport = "pull";
		agentRuntimeProcessState.merimoarAgentRunSubscriber = {
			stop: async () => {},
			waitForIdle: async () => {},
		};

		expect(isAgentRuntimeAvailable()).toBe(true);
	});

	test("is available for a configured push runtime without a subscriber", () => {
		agentRuntimeProcessState.merimoarAgentRunTransport = "push";
		delete agentRuntimeProcessState.merimoarAgentRunSubscriber;

		expect(isAgentRuntimeAvailable()).toBe(true);
	});
});
