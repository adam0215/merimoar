// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { loadCompleteTranscript } from "../server/agent/convex-runtime";

describe("Convex runtime transcript pagination", () => {
	it("reconstructs every turn and item exactly across multiple pages", async () => {
		const memberMessage = {
			kind: "member_message" as const,
			body: "Original member input",
			sequence: 1,
		};
		const toolItem = {
			kind: "tool" as const,
			_id: "item-tool",
			toolCallId: "call-1",
			toolName: "custom_lookup",
			runId: "run-1",
			inputJson: '{"query":"  exact input  "}',
			sequence: 2,
			status: "completed" as const,
			outputJson: '{"value":"exact output"}',
		};
		const agentMessage = {
			kind: "agent_message" as const,
			body: "Second turn response",
			sequence: 1,
		};
		const loadTurnsImplementation = async ({
			cursor,
		}: {
			numItems: number;
			cursor: string | null;
		}) =>
			cursor === null
				? {
						taskId: "task-1",
						selectedStatusItemId: "item-tool",
						turns: {
							page: [{ turnId: "turn-1", sequence: 1 }],
							isDone: false,
							continueCursor: "turn-page-2",
						},
					}
				: {
						taskId: "task-1",
						selectedStatusItemId: "item-tool",
						turns: {
							page: [{ turnId: "turn-2", sequence: 2 }],
							isDone: true,
							continueCursor: "turn-done",
						},
					};
		const loadTurns = vi.fn<typeof loadTurnsImplementation>(
			loadTurnsImplementation,
		);
		const loadItemsImplementation = async (
			turnId: string,
			{ cursor }: { numItems: number; cursor: string | null },
		) => {
			if (turnId === "turn-1" && cursor === null) {
				return {
					page: [memberMessage],
					isDone: false,
					continueCursor: "turn-1-page-2",
				};
			}
			if (turnId === "turn-1") {
				return {
					page: [toolItem],
					isDone: true,
					continueCursor: "turn-1-done",
				};
			}
			return {
				page: [agentMessage],
				isDone: true,
				continueCursor: "turn-2-done",
			};
		};
		const loadItems = vi.fn<typeof loadItemsImplementation>(
			loadItemsImplementation,
		);

		await expect(
			loadCompleteTranscript({ loadTurns, loadItems }),
		).resolves.toEqual({
			taskId: "task-1",
			selectedStatusItemId: "item-tool",
			turns: [
				{
					turnId: "turn-1",
					sequence: 1,
					items: [memberMessage, toolItem],
				},
				{
					turnId: "turn-2",
					sequence: 2,
					items: [agentMessage],
				},
			],
		});
		expect(loadTurns.mock.calls).toEqual([
			[{ numItems: 50, cursor: null }],
			[{ numItems: 50, cursor: "turn-page-2" }],
		]);
		expect(loadItems.mock.calls).toEqual([
			["turn-1", { numItems: 50, cursor: null }],
			["turn-1", { numItems: 50, cursor: "turn-1-page-2" }],
			["turn-2", { numItems: 50, cursor: null }],
		]);
	});
});
