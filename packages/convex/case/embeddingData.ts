import { ConvexError, v } from "convex/values";
import { requireActor } from "#/auth/access";
import {
	buildEmailThreadEmbeddingInput,
	caseSuggestionValidator,
} from "#/case/embeddingModel";
import { getWorkosUser } from "#/workos";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internalMutation, internalQuery } from "../_generated/server";

const MAX_INBOUND_MESSAGES_PER_THREAD = 100;

async function getCaseOwnerName(
	ctx: Pick<QueryCtx, "db" | "runQuery">,
	ownerMemberId: Id<"organizationMembers"> | null,
	organizationId: Id<"organizations">,
) {
	if (!ownerMemberId) {
		return null;
	}
	const member = await ctx.db.get(ownerMemberId);
	if (!member || member.organizationId !== organizationId) {
		return null;
	}
	const user = await getWorkosUser(ctx, member.workosUserId);
	return user
		? user.name?.trim() ||
				[user.firstName, user.lastName].filter(Boolean).join(" ") ||
				user.email
		: "Former member";
}

export async function removeCaseEmbedding(
	ctx: Pick<MutationCtx, "db">,
	caseId: Id<"cases">,
) {
	const existing = await ctx.db
		.query("caseEmbeddings")
		.withIndex("by_case_id", (index) => index.eq("caseId", caseId))
		.unique();
	if (existing) {
		await ctx.db.delete(existing._id);
	}
}

export const getCaseEmbeddingInput = internalQuery({
	args: {
		caseId: v.id("cases"),
	},
	returns: v.union(
		v.object({
			title: v.string(),
			description: v.string(),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const caseRecord = await ctx.db.get(args.caseId);
		return caseRecord
			? {
					title: caseRecord.title,
					description: caseRecord.description,
				}
			: null;
	},
});

export const getEmailThreadSuggestionContext = internalQuery({
	args: {
		threadId: v.id("emailThreads"),
	},
	returns: v.object({
		organizationId: v.id("organizations"),
		embeddingInput: v.union(v.string(), v.null()),
	}),
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		const thread = await ctx.db.get(args.threadId);
		if (!thread || thread.organizationId !== actor.organization._id) {
			throw new ConvexError({
				code: "EMAIL_THREAD_NOT_FOUND",
				message: "The email thread could not be found.",
			});
		}

		const inboundMessages = await ctx.db
			.query("emailMessages")
			.withIndex("by_thread_id_and_direction_and_sent_at", (index) =>
				index.eq("threadId", thread._id).eq("direction", "inbound"),
			)
			.order("desc")
			.take(MAX_INBOUND_MESSAGES_PER_THREAD);

		return {
			organizationId: actor.organization._id,
			embeddingInput: buildEmailThreadEmbeddingInput(
				inboundMessages.reverse().map((message) => message.textBody),
			),
		};
	},
});

export const replaceCaseEmbedding = internalMutation({
	args: {
		caseId: v.id("cases"),
		expectedTitle: v.string(),
		expectedDescription: v.string(),
		embedding: v.array(v.float64()),
	},
	returns: v.boolean(),
	handler: async (ctx, args) => {
		const caseRecord = await ctx.db.get(args.caseId);
		if (
			!caseRecord ||
			caseRecord.title !== args.expectedTitle ||
			caseRecord.description !== args.expectedDescription
		) {
			return false;
		}

		const existing = await ctx.db
			.query("caseEmbeddings")
			.withIndex("by_case_id", (index) => index.eq("caseId", caseRecord._id))
			.unique();
		const fields = {
			caseId: caseRecord._id,
			organizationId: caseRecord.organizationId,
			embedding: args.embedding,
		};
		if (existing) {
			await ctx.db.replace(existing._id, fields);
		} else {
			await ctx.db.insert("caseEmbeddings", fields);
		}
		return true;
	},
});

export const hydrateCaseSuggestionHits = internalQuery({
	args: {
		organizationId: v.id("organizations"),
		hits: v.array(
			v.object({
				embeddingId: v.id("caseEmbeddings"),
				score: v.number(),
			}),
		),
	},
	returns: v.array(caseSuggestionValidator),
	handler: async (ctx, args) => {
		const suggestions = await Promise.all(
			args.hits.map(async (hit) => {
				const embedding = await ctx.db.get(hit.embeddingId);
				if (!embedding || embedding.organizationId !== args.organizationId) {
					return null;
				}
				const caseRecord = await ctx.db.get(embedding.caseId);
				if (!caseRecord || caseRecord.organizationId !== args.organizationId) {
					return null;
				}
				return {
					caseId: caseRecord._id,
					title: caseRecord.title,
					description: caseRecord.description,
					reference: caseRecord.reference,
					status: caseRecord.status,
					lastActivityAt: caseRecord.lastActivityAt,
					dueAt: caseRecord.dueAt,
					ownerName: await getCaseOwnerName(
						ctx,
						caseRecord.ownerMemberId,
						caseRecord.organizationId,
					),
					score: hit.score,
				};
			}),
		);
		return suggestions.filter((suggestion) => suggestion !== null);
	},
});
