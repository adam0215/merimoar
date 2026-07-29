import { type Infer, v } from "convex/values";
import { caseStatusValidator } from "#/case/model";

export const CASE_EMBEDDING_MODEL = "gemini-embedding-001";
export const CASE_EMBEDDING_DIMENSIONS = 512;
export const CASE_SUGGESTION_LIMIT = 3;

export const caseSuggestionValidator = v.object({
	caseId: v.id("cases"),
	title: v.string(),
	description: v.string(),
	reference: v.string(),
	status: caseStatusValidator,
	lastActivityAt: v.number(),
	dueAt: v.union(v.number(), v.null()),
	ownerName: v.union(v.string(), v.null()),
	score: v.number(),
});

export type CaseSuggestion = Infer<typeof caseSuggestionValidator>;

const MAX_EMBEDDING_INPUT_CHARACTERS = 6_000;

function truncateEmbeddingInput(value: string) {
	const trimmed = value.trim();
	return trimmed.length > MAX_EMBEDDING_INPUT_CHARACTERS
		? trimmed.slice(-MAX_EMBEDDING_INPUT_CHARACTERS)
		: trimmed;
}

export function buildCaseEmbeddingInput(title: string, description: string) {
	return [title.trim(), truncateEmbeddingInput(description)]
		.filter(Boolean)
		.join("\n");
}

export function buildEmailThreadEmbeddingInput(messageBodies: string[]) {
	const threadText = truncateEmbeddingInput(
		messageBodies
			.map((body) => body.trim())
			.filter(Boolean)
			.join("\n"),
	);
	return threadText || null;
}

export function normalizeEmbeddingForVectorSearch(embedding: number[]) {
	const magnitude = Math.sqrt(
		embedding.reduce((sum, value) => sum + value * value, 0),
	);
	if (!Number.isFinite(magnitude) || magnitude === 0) {
		throw new Error("Gemini returned an embedding that cannot be normalized");
	}
	return embedding.map((value) => value / magnitude);
}
