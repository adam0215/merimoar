"use node";

import { ActionCache } from "@convex-dev/action-cache";
import { GoogleGenAI } from "@google/genai";
import { v } from "convex/values";
import { convert } from "html-to-text";
import {
	buildCaseEmbeddingInput,
	CASE_EMBEDDING_DIMENSIONS,
	CASE_EMBEDDING_MODEL,
	CASE_SUGGESTION_LIMIT,
	type CaseSuggestion,
	caseSuggestionValidator,
	normalizeEmbeddingForVectorSearch,
} from "#/case/embeddingModel";
import { components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action, env, internalAction } from "../_generated/server";

const VECTOR_SEARCH_LIMIT = 8;
const QUERY_EMBEDDING_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type EmbeddingTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export function formatCaseSuggestionDescription(description: string) {
	return convert(description, {
		wordwrap: false,
		selectors: [{ selector: "img", format: "skip" }],
	}).trim();
}

async function generateEmbedding(
	input: string,
	taskType: EmbeddingTask,
	title?: string,
) {
	const response = await new GoogleGenAI({
		apiKey: env.GEMINI_API_KEY,
	}).models.embedContent({
		model: CASE_EMBEDDING_MODEL,
		contents: input,
		config: {
			taskType,
			...(title ? { title } : {}),
			outputDimensionality: CASE_EMBEDDING_DIMENSIONS,
		},
	});
	const embedding = response.embeddings?.[0]?.values;
	if (
		!embedding ||
		embedding.length !== CASE_EMBEDDING_DIMENSIONS ||
		embedding.some((value) => !Number.isFinite(value))
	) {
		throw new Error("Gemini returned an invalid case embedding");
	}
	return normalizeEmbeddingForVectorSearch(embedding);
}

export const embedCase = internalAction({
	args: {
		caseId: v.id("cases"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const input: { title: string; description: string } | null =
			await ctx.runQuery(internal.case.embeddingData.getCaseEmbeddingInput, {
				caseId: args.caseId,
			});
		if (!input) {
			return null;
		}

		const embedding = await generateEmbedding(
			buildCaseEmbeddingInput(input.title, input.description),
			"RETRIEVAL_DOCUMENT",
			input.title,
		);
		await ctx.runMutation(internal.case.embeddingData.replaceCaseEmbedding, {
			caseId: args.caseId,
			expectedTitle: input.title,
			expectedDescription: input.description,
			embedding,
		});
		return null;
	},
});

export const generateQueryEmbedding = internalAction({
	args: {
		input: v.string(),
	},
	returns: v.array(v.float64()),
	handler: (_ctx, args): Promise<number[]> =>
		generateEmbedding(args.input, "RETRIEVAL_QUERY"),
});

const queryEmbeddingCache = new ActionCache(components.actionCache, {
	action: internal.case.embedding.generateQueryEmbedding,
	name: `case-query-embedding-${CASE_EMBEDDING_MODEL}-${CASE_EMBEDDING_DIMENSIONS}-v1`,
	ttl: QUERY_EMBEDDING_CACHE_TTL_MS,
});

export const suggestForEmailThread = action({
	args: {
		threadId: v.id("emailThreads"),
	},
	returns: v.array(caseSuggestionValidator),
	handler: async (ctx, args) => {
		const suggestionContext: {
			organizationId: Id<"organizations">;
			embeddingInput: string | null;
		} = await ctx.runQuery(
			internal.case.embeddingData.getEmailThreadSuggestionContext,
			{ threadId: args.threadId },
		);
		if (!suggestionContext.embeddingInput) {
			return [];
		}

		const queryEmbedding: number[] = await queryEmbeddingCache.fetch(ctx, {
			input: suggestionContext.embeddingInput,
		});
		const hits = await ctx.vectorSearch("caseEmbeddings", "by_embedding", {
			vector: queryEmbedding,
			limit: VECTOR_SEARCH_LIMIT,
			filter: (filter) =>
				filter.eq("organizationId", suggestionContext.organizationId),
		});
		const suggestions: CaseSuggestion[] = await ctx.runQuery(
			internal.case.embeddingData.hydrateCaseSuggestionHits,
			{
				organizationId: suggestionContext.organizationId,
				hits: hits.map((hit) => ({
					embeddingId: hit._id,
					score: hit._score,
				})),
			},
		);
		return suggestions.slice(0, CASE_SUGGESTION_LIMIT).map((suggestion) => ({
			...suggestion,
			description: formatCaseSuggestionDescription(suggestion.description),
		}));
	},
});
