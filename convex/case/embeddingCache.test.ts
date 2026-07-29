/// <reference types="vite/client" />

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
	CASE_EMBEDDING_DIMENSIONS,
	CASE_EMBEDDING_MODEL,
} from "./embeddingModel";

const actionCacheMock = vi.hoisted(() => ({
	config: undefined as
		| { action: unknown; name?: string; ttl?: number }
		| undefined,
	fetch:
		vi.fn<(ctx: ActionCtx, args: { input: string }) => Promise<number[]>>(),
}));

vi.mock("@convex-dev/action-cache", () => ({
	ActionCache: class {
		constructor(
			_component: unknown,
			config: { action: unknown; name?: string; ttl?: number },
		) {
			actionCacheMock.config = config;
		}

		fetch = actionCacheMock.fetch;
	},
}));

import { suggestForEmailThread } from "./embedding";

const suggestForEmailThreadHandler = (
	suggestForEmailThread as unknown as {
		_handler: (
			ctx: ActionCtx,
			args: { threadId: Id<"emailThreads"> },
		) => Promise<unknown>;
	}
)._handler;

describe("case query embedding cache", () => {
	beforeEach(() => {
		actionCacheMock.fetch.mockReset();
	});

	it("caches the condensed thread text while keeping vector search fresh", async () => {
		const threadId = "thread" as Id<"emailThreads">;
		const organizationId = "organization" as Id<"organizations">;
		const embeddingInput = "The boiler stopped working.";
		const embedding = Array.from(
			{ length: CASE_EMBEDDING_DIMENSIONS },
			(_, index) => (index === 0 ? 1 : 0),
		);
		const runQuery = vi
			.fn<(...args: unknown[]) => Promise<unknown>>()
			.mockResolvedValueOnce({ organizationId, embeddingInput })
			.mockResolvedValueOnce([]);
		const vectorSearch = vi
			.fn<(...args: unknown[]) => Promise<unknown>>()
			.mockResolvedValue([]);
		const ctx = { runQuery, vectorSearch } as unknown as ActionCtx;
		actionCacheMock.fetch.mockResolvedValue(embedding);

		await expect(
			suggestForEmailThreadHandler(ctx, { threadId }),
		).resolves.toEqual([]);

		expect(actionCacheMock.config).toMatchObject({
			name: `case-query-embedding-${CASE_EMBEDDING_MODEL}-${CASE_EMBEDDING_DIMENSIONS}-v1`,
			ttl: 7 * 24 * 60 * 60 * 1000,
		});
		expect(actionCacheMock.fetch).toHaveBeenCalledWith(ctx, {
			input: embeddingInput,
		});
		expect(vectorSearch).toHaveBeenCalledWith(
			"caseEmbeddings",
			"by_embedding",
			expect.objectContaining({
				vector: embedding,
				limit: 8,
			}),
		);
	});
});
