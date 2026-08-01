import { describe, expect, it, vi } from "vitest";
import { CoalescedTextWriter } from "./coalesced-text-writer";

describe("CoalescedTextWriter", () => {
	it("persists full text on the throttle and flushes the final text once", async () => {
		vi.useFakeTimers();
		const persisted: string[] = [];
		const writer = new CoalescedTextWriter(
			"item-1",
			async (_itemId, body) => {
				persisted.push(body);
			},
			4_000,
		);

		writer.append("A");
		writer.append("gent");
		await vi.advanceTimersByTimeAsync(3_999);
		expect(persisted).toEqual([]);
		await vi.advanceTimersByTimeAsync(1);
		expect(persisted).toEqual(["Agent"]);

		writer.append(" response");
		await writer.finish();
		expect(persisted).toEqual(["Agent", "Agent response"]);
		await writer.finish();
		expect(persisted).toEqual(["Agent", "Agent response"]);
		vi.useRealTimers();
	});

	it("surfaces a scheduled persistence failure when the writer finishes", async () => {
		vi.useFakeTimers();
		const persistenceError = new Error("Persistence failed");
		const writer = new CoalescedTextWriter(
			"item-1",
			async () => {
				throw persistenceError;
			},
			4_000,
		);

		writer.append("Agent response");
		await vi.advanceTimersByTimeAsync(4_000);

		await expect(writer.finish()).rejects.toBe(persistenceError);
		vi.useRealTimers();
	});

	it("does not persist empty or already-flushed text at a boundary", async () => {
		const persist = vi.fn<(itemId: string, body: string) => Promise<void>>(
			async () => {},
		);
		const writer = new CoalescedTextWriter("item-1", persist, 4_000);

		await writer.flush();
		writer.append("Useful text");
		await writer.flush();
		await writer.flush();

		expect(persist).toHaveBeenCalledOnce();
		expect(persist).toHaveBeenCalledWith("item-1", "Useful text");
		await writer.finish();
	});

	it("creates a durable item atomically with the first non-empty body", async () => {
		const starts: string[] = [];
		const persist = vi.fn<(itemId: string, body: string) => Promise<void>>(
			async () => {},
		);
		const writer = new CoalescedTextWriter(
			async (initialBody) => {
				starts.push(initialBody);
				return "item-1";
			},
			persist,
			4_000,
		);

		await writer.flush();
		expect(starts).toEqual([]);
		writer.append("");
		await writer.finish();
		expect(starts).toEqual([]);

		writer.append("First durable text");
		await writer.flush();
		expect(starts).toEqual(["First durable text"]);
		expect(persist).not.toHaveBeenCalled();

		writer.append(" and more");
		await writer.finish();
		expect(persist).toHaveBeenCalledWith(
			"item-1",
			"First durable text and more",
		);
	});
});
