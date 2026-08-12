// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { getBackgroundExecutionRegistrar } from "../../../server/agent/background-execution";

describe("agent background execution", () => {
	it("registers work through the host request lifecycle", () => {
		const waitUntil = vi.fn<(execution: Promise<void>) => void>();
		const request = Object.assign(new Request("https://runtime.example"), {
			waitUntil,
		});
		const execution = Promise.resolve();

		getBackgroundExecutionRegistrar(request)?.(execution);

		expect(waitUntil).toHaveBeenCalledWith(execution);
	});

	it("fails closed when the host has no background lifecycle", () => {
		expect(
			getBackgroundExecutionRegistrar(new Request("https://runtime.example")),
		).toBeNull();
	});
});
