/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { createTest, syncWorkosUser } from "../test.setup";
import { formatCaseSuggestionDescription } from "./embedding";
import {
	CASE_EMBEDDING_DIMENSIONS,
	normalizeEmbeddingForVectorSearch,
} from "./embeddingModel";

const ISSUER = "https://api.workos.com/";
const ACTOR_SUBJECT = "user_embedding_actor";

async function createFixture() {
	const base = createTest();
	await syncWorkosUser(base, {
		id: ACTOR_SUBJECT,
		name: "Embedding Actor",
		email: "actor@example.com",
	});
	const ids = await base.run(async (ctx) => {
		const organizationId = await ctx.db.insert("organizations", {
			name: "Embedding organization",
			workosOrganizationId: "org_embedding",
			active: true,
		});
		const otherOrganizationId = await ctx.db.insert("organizations", {
			name: "Other organization",
			workosOrganizationId: "org_embedding_other",
			active: true,
		});
		const actorMemberId = await ctx.db.insert("organizationMembers", {
			organizationId,
			workosUserId: ACTOR_SUBJECT,
			active: true,
		});
		const inboxId = await ctx.db.insert("emailInboxes", {
			organizationId,
			displayName: "Support",
			address: "support@example.com",
			status: "active",
			unreadThreadCount: 0,
		});
		const otherInboxId = await ctx.db.insert("emailInboxes", {
			organizationId: otherOrganizationId,
			displayName: "Other support",
			address: "support@other.example.com",
			status: "active",
			unreadThreadCount: 0,
		});
		const integrationId = await ctx.db.insert("emailIntegrations", {
			organizationId,
			provider: "resend",
			status: "connected",
			workosUserId: ACTOR_SUBJECT,
			workosOrganizationId: "org_embedding",
			workosDataIntegrationId: "data_embedding",
			workosConnectedAccountId: "account_embedding",
			workosConnectedAccountUpdatedAt: 1,
		});
		const contactId = await ctx.db.insert("contacts", {
			organizationId,
			address: "sender@example.com",
			firstSeenAt: 1,
			lastSeenAt: 3,
		});
		const threadId = await ctx.db.insert("emailThreads", {
			organizationId,
			inboxId,
			lastActivityAt: 3,
		});
		const otherThreadId = await ctx.db.insert("emailThreads", {
			organizationId: otherOrganizationId,
			inboxId: otherInboxId,
			lastActivityAt: 1,
		});
		const commonMessageFields = {
			inboxId,
			integrationId,
			threadId,
			references: [],
			from: { address: "sender@example.com" },
			to: [{ address: "support@example.com" }],
			cc: [],
			bcc: [],
			replyTo: [],
			subject: "A broken boiler",
		};
		await ctx.db.insert("emailMessages", {
			...commonMessageFields,
			direction: "inbound",
			senderContactId: contactId,
			externalMessageId: "inbound-1",
			textBody: "The boiler stopped working.",
			sentAt: 1,
			receivedAt: 1,
		});
		await ctx.db.insert("emailMessages", {
			...commonMessageFields,
			direction: "outbound",
			authoredByMemberId: actorMemberId,
			externalMessageId: "outbound-1",
			textBody: "We are looking into it.",
			sentAt: 2,
		});
		await ctx.db.insert("emailMessages", {
			...commonMessageFields,
			direction: "inbound",
			senderContactId: contactId,
			externalMessageId: "inbound-2",
			textBody: "There is no heat in the building.",
			sentAt: 3,
			receivedAt: 3,
		});
		const caseId = await ctx.db.insert("cases", {
			organizationId,
			reference: "CASE-BOILER",
			title: "Boiler outage",
			description: "The building has no heat.",
			ownerMemberId: actorMemberId,
			dueAt: 5,
			status: "open",
			lastActivityAt: 3,
			createdAt: 1,
			updatedAt: 3,
		});
		const otherCaseId = await ctx.db.insert("cases", {
			organizationId: otherOrganizationId,
			reference: "CASE-OTHER",
			title: "Other case",
			description: "Must not leak across organizations.",
			ownerMemberId: null,
			dueAt: null,
			status: "open",
			lastActivityAt: 1,
			createdAt: 1,
			updatedAt: 1,
		});
		return {
			organizationId,
			otherOrganizationId,
			threadId,
			otherThreadId,
			caseId,
			otherCaseId,
		};
	});

	return {
		base,
		actor: base.withIdentity({
			issuer: ISSUER,
			subject: ACTOR_SUBJECT,
			org_id: "org_embedding",
		}),
		...ids,
	};
}

describe("case embedding data", () => {
	it("builds the suggestion input from inbound messages in chronological order", async () => {
		const { actor, organizationId, threadId } = await createFixture();

		await expect(
			actor.query(internal.case.embeddingData.getEmailThreadSuggestionContext, {
				threadId,
			}),
		).resolves.toEqual({
			organizationId,
			embeddingInput:
				"The boiler stopped working.\nThere is no heat in the building.",
		});
	});

	it("does not expose a thread from another organization", async () => {
		const { actor, otherThreadId } = await createFixture();

		await expect(
			actor.query(internal.case.embeddingData.getEmailThreadSuggestionContext, {
				threadId: otherThreadId,
			}),
		).rejects.toThrow("The email thread could not be found.");
	});

	it("stores only current embeddings and hydrates hits inside the organization", async () => {
		const { base, caseId, organizationId, otherCaseId, otherOrganizationId } =
			await createFixture();
		const embedding = Array.from(
			{ length: CASE_EMBEDDING_DIMENSIONS },
			(_, index) => (index === 0 ? 1 : 0),
		);

		await expect(
			base.mutation(internal.case.embeddingData.replaceCaseEmbedding, {
				caseId,
				expectedTitle: "Stale title",
				expectedDescription: "The building has no heat.",
				embedding,
			}),
		).resolves.toBe(false);

		await expect(
			base.mutation(internal.case.embeddingData.replaceCaseEmbedding, {
				caseId,
				expectedTitle: "Boiler outage",
				expectedDescription: "The building has no heat.",
				embedding,
			}),
		).resolves.toBe(true);

		const { embeddingId, otherEmbeddingId } = await base.run(async (ctx) => {
			const stored = await ctx.db
				.query("caseEmbeddings")
				.withIndex("by_case_id", (index) => index.eq("caseId", caseId))
				.unique();
			if (!stored) {
				throw new Error("The case embedding was not stored");
			}
			const otherEmbeddingId = await ctx.db.insert("caseEmbeddings", {
				caseId: otherCaseId,
				organizationId: otherOrganizationId,
				embedding,
			});
			return { embeddingId: stored._id, otherEmbeddingId };
		});

		await expect(
			base.query(internal.case.embeddingData.hydrateCaseSuggestionHits, {
				organizationId,
				hits: [
					{ embeddingId: otherEmbeddingId, score: 0.99 },
					{ embeddingId, score: 0.9 },
				],
			}),
		).resolves.toEqual([
			{
				caseId,
				title: "Boiler outage",
				description: "The building has no heat.",
				reference: "CASE-BOILER",
				status: "open",
				lastActivityAt: 3,
				dueAt: 5,
				ownerName: "Embedding Actor",
				score: 0.9,
			},
		]);
	});

	it("normalizes reduced Gemini Embedding 1 vectors", () => {
		expect(normalizeEmbeddingForVectorSearch([3, 4])).toEqual([0.6, 0.8]);
		expect(() => normalizeEmbeddingForVectorSearch([0, 0])).toThrow(
			"cannot be normalized",
		);
	});

	it("formats rich case descriptions as plain preview text", () => {
		expect(
			formatCaseSuggestionDescription(
				"<p>Reschedule the <strong>listing photography</strong>.</p>",
			),
		).toBe("Reschedule the listing photography.");
	});
});
