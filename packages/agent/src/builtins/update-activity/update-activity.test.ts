import * as v from "valibot";
import { describe, expect, it, vi } from "vitest";
import { type AgentContext, createLocalAgentContext } from "../../index";
import { executeUpdateActivity, updateActivityInputSchema } from "./ai-sdk";

describe("update_activity", () => {
	it("accepts a concise structured intention and rejects unrelated fields", () => {
		expect(
			v.safeParse(updateActivityInputSchema, {
				title: "Reviewing related cases",
				detail: "Checking whether the open records describe the same issue.",
			}).success,
		).toBe(true);
		expect(
			v.safeParse(updateActivityInputSchema, {
				title: "Reviewing",
				status: "active",
			}).success,
		).toBe(false);
		expect(
			v.safeParse(updateActivityInputSchema, {
				title: "x".repeat(201),
			}).success,
		).toBe(false);
	});

	it("persists only an intentional high-level activity update", async () => {
		const context = createLocalAgentContext();
		const updateActivity = vi.fn<
			AgentContext["capabilities"]["updateActivity"]
		>(async () => {});
		const testContext: AgentContext = {
			...context,
			capabilities: { ...context.capabilities, updateActivity },
		};

		await executeUpdateActivity(testContext, {
			title: "Preparing a case update",
			detail: "Summarizing verified evidence.",
		});

		expect(updateActivity).toHaveBeenCalledOnce();
		expect(updateActivity).toHaveBeenCalledWith({
			title: "Preparing a case update",
			detail: "Summarizing verified evidence.",
		});
	});
});
