import { afterEach, describe, expect, test } from "vitest";
import {
	agentRuntimeProcessState,
	isAgentRuntimeAvailable,
} from "../../../server/agent/runtime-state.ts";

describe("agent runtime availability", () => {
	afterEach(() => {
		delete agentRuntimeProcessState.merimoarAgentRunSubscriber;
	});

	test("is unavailable without a running subscriber", () => {
		delete agentRuntimeProcessState.merimoarAgentRunSubscriber;

		expect(isAgentRuntimeAvailable()).toBe(false);
	});

	test("is available while the subscriber is running", () => {
		agentRuntimeProcessState.merimoarAgentRunSubscriber = {
			stop: async () => {},
			waitForIdle: async () => {},
		};

		expect(isAgentRuntimeAvailable()).toBe(true);
	});
});
