import * as v from "valibot";
import { describe, expect, it, vi } from "vitest";
import { type AgentContext, createLocalAgentContext } from "../../index";
import { executeUpdateTaskStatus, updateTaskStatusInputSchema } from "./ai-sdk";

describe("update_task_status", () => {
	it("accepts only the fields belonging to the selected status", () => {
		expect(
			v.safeParse(updateTaskStatusInputSchema, {
				status: "completed",
				result: "Finished the work and documented why.",
			}).success,
		).toBe(true);
		expect(
			v.safeParse(updateTaskStatusInputSchema, {
				status: "waiting",
				reason: "Waiting for a reply.",
				result: "This field is irrelevant.",
			}).success,
		).toBe(false);
		expect(
			v.safeParse(updateTaskStatusInputSchema, {
				status: "completed",
			}).success,
		).toBe(false);
		expect(
			v.safeParse(updateTaskStatusInputSchema, {
				status: "waiting_for_approval",
				approvalRequest: "",
			}).success,
		).toBe(false);
		expect(
			v.safeParse(updateTaskStatusInputSchema, {
				status: "unable_to_continue",
				result: "No authorized path remains; the requested record is absent.",
			}).success,
		).toBe(true);
		expect(
			v.safeParse(updateTaskStatusInputSchema, {
				status: "unable_to_continue",
				reason: "Legacy generic reason.",
			}).success,
		).toBe(false);
	});

	it("creates a concrete approval id and records a durable status update", async () => {
		const context = createLocalAgentContext();
		const updateTaskStatus = vi.fn<
			AgentContext["capabilities"]["updateTaskStatus"]
		>(async (update) => update);
		const testContext: AgentContext = {
			...context,
			capabilities: {
				...context.capabilities,
				updateTaskStatus,
			},
		};

		await executeUpdateTaskStatus(
			testContext,
			{
				status: "waiting_for_approval",
				approvalRequest: "Approve closing CASE-42?",
			},
			"status-call",
		);

		expect(updateTaskStatus).toHaveBeenCalledWith(
			{
				status: "waiting_for_approval",
				approvalId: expect.stringMatching(/^task:[a-f0-9]{64}$/),
				approvalRequest: "Approve closing CASE-42?",
			},
			"status-call",
		);
	});
});
