import { describe, expect, it } from "vitest";
import { createLocalAgentContext } from "./local-context";

describe("local agent context", () => {
	it("keeps created cases and updates visible to later tool steps", async () => {
		const context = createLocalAgentContext();
		const created = (await context.capabilities.createCase(
			{
				title: "Follow-up",
				description: "Initial description",
				dueAt: null,
			},
			"create-case",
		)) as { id: string };

		await context.capabilities.updateCase(
			{
				caseId: created.id,
				description: "Updated description",
				status: "waiting",
			},
			"update-case",
		);
		expect(
			await context.capabilities.readCase({ caseId: created.id }),
		).toMatchObject({
			description: "Updated description",
			status: "waiting",
		});
		expect(
			await context.capabilities.search({
				searchQuery: "Updated description",
				filter: { kind: "cases" },
			}),
		).toHaveLength(1);
	});

	it("isolates state between local TUI sessions", async () => {
		const first = createLocalAgentContext();
		await first.capabilities.createCase(
			{
				title: "Only in first",
				description: "",
				dueAt: null,
			},
			"create-case",
		);

		const second = createLocalAgentContext();
		expect(
			await second.capabilities.search({
				searchQuery: "Only in first",
				filter: { kind: "all" },
			}),
		).toEqual([]);
	});
});
