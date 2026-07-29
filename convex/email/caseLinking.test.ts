import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { createTest, syncWorkosUser } from "../test.setup";

const ISSUER = "https://api.workos.com/";

async function createCaseLinkingFixture() {
	const base = createTest();
	await Promise.all([
		syncWorkosUser(base, {
			id: "user_adam",
			name: "Adam",
			email: "adam@merimoar.com",
		}),
		syncWorkosUser(base, {
			id: "user_other",
			name: "Other",
			email: "other@example.com",
		}),
	]);

	const ids = await base.run(async (ctx) => {
		const organizationId = await ctx.db.insert("organizations", {
			name: "Merimoar",
			workosOrganizationId: "org_merimoar",
			active: true,
		});
		const otherOrganizationId = await ctx.db.insert("organizations", {
			name: "Other",
			workosOrganizationId: "org_other",
			active: true,
		});
		const actorMemberId = await ctx.db.insert("organizationMembers", {
			organizationId,
			workosUserId: "user_adam",
			active: true,
		});
		await ctx.db.insert("organizationMembers", {
			organizationId: otherOrganizationId,
			workosUserId: "user_other",
			active: true,
		});
		const inboxId = await ctx.db.insert("emailInboxes", {
			organizationId,
			displayName: "Support",
			address: "support@merimoar.test",
			status: "active",
			unreadThreadCount: 0,
		});
		const otherInboxId = await ctx.db.insert("emailInboxes", {
			organizationId: otherOrganizationId,
			displayName: "Other",
			address: "support@other.test",
			status: "active",
			unreadThreadCount: 0,
		});
		const integrationId = await ctx.db.insert("emailIntegrations", {
			organizationId,
			provider: "resend",
			status: "connected",
			workosOrganizationId: "org_merimoar",
			workosUserId: "user_adam",
			workosDataIntegrationId: "data_integration_resend",
			workosConnectedAccountId: "connected_account_resend",
			workosConnectedAccountUpdatedAt: 1_000,
		});
		const firstThreadId = await ctx.db.insert("emailThreads", {
			organizationId,
			inboxId,
			lastActivityAt: 100,
		});
		const secondThreadId = await ctx.db.insert("emailThreads", {
			organizationId,
			inboxId,
			lastActivityAt: 200,
		});
		const otherThreadId = await ctx.db.insert("emailThreads", {
			organizationId: otherOrganizationId,
			inboxId: otherInboxId,
			lastActivityAt: 300,
		});
		const firstCaseId = await insertCase(ctx, organizationId, "CASE-FIRST");
		const secondCaseId = await insertCase(ctx, organizationId, "CASE-SECOND");
		const otherCaseId = await insertCase(
			ctx,
			otherOrganizationId,
			"CASE-OTHER",
		);
		return {
			organizationId,
			actorMemberId,
			inboxId,
			integrationId,
			firstThreadId,
			secondThreadId,
			otherThreadId,
			firstCaseId,
			secondCaseId,
			otherCaseId,
		};
	});

	return {
		base,
		actor: base.withIdentity({
			issuer: ISSUER,
			subject: "user_adam",
			org_id: "org_merimoar",
		}),
		otherActor: base.withIdentity({
			issuer: ISSUER,
			subject: "user_other",
			org_id: "org_other",
		}),
		...ids,
	};
}

async function insertCase(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	reference: string,
) {
	return await ctx.db.insert("cases", {
		organizationId,
		reference,
		title: `${reference} title`,
		description: "",
		ownerMemberId: null,
		dueAt: null,
		status: "open",
		lastActivityAt: 100,
		createdAt: 100,
		updatedAt: 100,
	});
}

describe("email to case linking", () => {
	it("keeps one active case per thread, allows several threads per case, and preserves moves", async () => {
		const {
			base,
			actor,
			actorMemberId,
			firstThreadId,
			secondThreadId,
			firstCaseId,
			secondCaseId,
		} = await createCaseLinkingFixture();

		const firstRelationId = await actor.mutation(
			api.case.mutations.linkEmailThread,
			{ caseId: firstCaseId, threadId: firstThreadId },
		);
		expect(
			await actor.mutation(api.case.mutations.linkEmailThread, {
				caseId: firstCaseId,
				threadId: firstThreadId,
			}),
		).toBe(firstRelationId);
		const secondThreadRelationId = await actor.mutation(
			api.case.mutations.linkEmailThread,
			{ caseId: firstCaseId, threadId: secondThreadId },
		);
		const movedRelationId = await actor.mutation(
			api.case.mutations.linkEmailThread,
			{ caseId: secondCaseId, threadId: firstThreadId },
		);

		const state = await base.run(async (ctx) => ({
			relations: await ctx.db.query("caseEmailThreadRelations").collect(),
			events: await ctx.db.query("caseEvents").collect(),
		}));
		const firstThreadRelations = state.relations.filter(
			(relation) => relation.threadId === firstThreadId,
		);
		const activeRelations = state.relations.filter(
			(relation) => relation.endedAt === null,
		);

		expect(firstThreadRelations).toHaveLength(2);
		expect(firstThreadRelations).toContainEqual(
			expect.objectContaining({
				_id: firstRelationId,
				caseId: firstCaseId,
				endedAt: expect.any(Number),
				unlinkedByMemberId: actorMemberId,
			}),
		);
		expect(firstThreadRelations).toContainEqual(
			expect.objectContaining({
				_id: movedRelationId,
				caseId: secondCaseId,
				endedAt: null,
			}),
		);
		expect(activeRelations).toHaveLength(2);
		expect(activeRelations).toContainEqual(
			expect.objectContaining({
				_id: secondThreadRelationId,
				caseId: firstCaseId,
				threadId: secondThreadId,
			}),
		);
		expect(
			activeRelations.filter((relation) => relation.threadId === firstThreadId),
		).toHaveLength(1);
		expect(
			state.events.every(
				(event) => "type" in event && event.type === "system_change",
			),
		).toBe(true);
	});

	it("rejects cross-organization threads and cases", async () => {
		const {
			actor,
			otherActor,
			firstThreadId,
			otherThreadId,
			firstCaseId,
			otherCaseId,
		} = await createCaseLinkingFixture();

		await expect(
			actor.mutation(api.case.mutations.linkEmailThread, {
				caseId: firstCaseId,
				threadId: otherThreadId,
			}),
		).rejects.toThrow("could not be found");
		await expect(
			actor.mutation(api.case.mutations.linkEmailThread, {
				caseId: otherCaseId,
				threadId: firstThreadId,
			}),
		).rejects.toThrow("could not be found");
		await expect(
			otherActor.mutation(api.case.mutations.linkEmailThread, {
				caseId: otherCaseId,
				threadId: firstThreadId,
			}),
		).rejects.toThrow("could not be found");
	});

	it("unlinks an active relation without deleting its history and stays idempotent", async () => {
		const { base, actor, actorMemberId, firstThreadId, firstCaseId } =
			await createCaseLinkingFixture();
		const relationId = await actor.mutation(
			api.case.mutations.linkEmailThread,
			{ caseId: firstCaseId, threadId: firstThreadId },
		);

		await actor.mutation(api.case.mutations.unlinkEmailThread, { relationId });
		const afterFirstUnlink = await base.run(async (ctx) => ({
			relation: await ctx.db.get(relationId),
			activeRelations: await ctx.db
				.query("caseEmailThreadRelations")
				.withIndex("by_thread_id_and_ended_at", (index) =>
					index.eq("threadId", firstThreadId).eq("endedAt", null),
				)
				.collect(),
			unlinkEvents: (await ctx.db.query("caseEvents").collect()).filter(
				(event) =>
					"type" in event &&
					event.type === "system_change" &&
					event.body === "Email thread unlinked.",
			),
		}));

		expect(afterFirstUnlink.relation).toMatchObject({
			_id: relationId,
			endedAt: expect.any(Number),
			unlinkedByMemberId: actorMemberId,
		});
		expect(afterFirstUnlink.activeRelations).toHaveLength(0);
		expect(afterFirstUnlink.unlinkEvents).toHaveLength(1);
		expect(
			await actor.query(api.email.reader.getThread, {
				threadId: firstThreadId,
			}),
		).toMatchObject({ activeCase: null });
		expect(
			await actor.query(api.case.reader.get, { caseId: firstCaseId }),
		).toMatchObject({ emailThreads: [] });

		await actor.mutation(api.case.mutations.unlinkEmailThread, { relationId });
		const unlinkEventsAfterRetry = await base.run(async (ctx) =>
			(await ctx.db.query("caseEvents").collect()).filter(
				(event) =>
					"type" in event &&
					event.type === "system_change" &&
					event.body === "Email thread unlinked.",
			),
		);
		expect(unlinkEventsAfterRetry).toHaveLength(1);
	});

	it("rejects unlinking another organization's email relation", async () => {
		const { actor, otherActor, otherThreadId, otherCaseId } =
			await createCaseLinkingFixture();
		const otherRelationId = await otherActor.mutation(
			api.case.mutations.linkEmailThread,
			{ caseId: otherCaseId, threadId: otherThreadId },
		);

		await expect(
			actor.mutation(api.case.mutations.unlinkEmailThread, {
				relationId: otherRelationId,
			}),
		).rejects.toThrow("could not be found");
	});

	it("marks the linked case as needing attention for a new inbound message", async () => {
		const { base, actor, inboxId, integrationId, firstThreadId, firstCaseId } =
			await createCaseLinkingFixture();
		await actor.mutation(api.case.mutations.linkEmailThread, {
			caseId: firstCaseId,
			threadId: firstThreadId,
		});

		const receivedAt = 2_000_000_000_000;
		const eventIds = await base.run(async (ctx) => {
			await ctx.db.insert("emailThreadExternalReferences", {
				threadId: firstThreadId,
				inboxId,
				integrationId,
				externalThreadId: "provider-thread",
			});
			return await Promise.all(
				["ingest-one", "ingest-duplicate"].map((externalEventId) =>
					ctx.db.insert("emailIngestEvents", {
						inboxId,
						integrationId,
						externalEventId,
						externalMessageId: "provider-message",
						eventType: "email.received",
						status: "queued",
						rawPayload: "{}",
						receivedAt,
						attempts: 0,
						replayCount: 0,
						processingGeneration: 0,
					}),
				),
			);
		});
		const email = {
			externalMessageId: "provider-message",
			externalThreadId: "provider-thread",
			internetMessageId: "<provider-message@example.com>",
			references: [],
			from: { name: "Ada", address: "ada@example.com" },
			to: [{ address: "support@merimoar.test" }],
			cc: [],
			bcc: [],
			replyTo: [],
			subject: "Policy review",
			textBody: "Sensitive email content remains in the email record.",
			sentAt: receivedAt - 100,
			receivedAt,
		};
		const [firstEventId, duplicateEventId] = eventIds;
		if (!firstEventId || !duplicateEventId) {
			throw new Error("Missing ingest event fixtures");
		}

		const firstMessageId = await base.mutation(
			internal.email.ingest.storeInboundEmail,
			{
				eventId: firstEventId,
				processingGeneration: 0,
				email,
			},
		);
		expect(
			await base.mutation(internal.email.ingest.storeInboundEmail, {
				eventId: duplicateEventId,
				processingGeneration: 0,
				email,
			}),
		).toBe(firstMessageId);

		const state = await base.run(async (ctx) => ({
			caseRecord: await ctx.db.get(firstCaseId),
			events: await ctx.db
				.query("caseEvents")
				.withIndex("by_case_id_and_occurred_at", (index) =>
					index.eq("caseId", firstCaseId),
				)
				.collect(),
		}));
		const inboundEvents = state.events.filter(
			(event) => "type" in event && event.type === "inbound_email",
		);

		expect(inboundEvents).toHaveLength(1);
		expect(inboundEvents[0]).toMatchObject({
			emailMessageId: firstMessageId,
			occurredAt: receivedAt,
			createdByMemberId: null,
		});
		expect("body" in (inboundEvents[0] ?? {})).toBe(false);
		expect(state.caseRecord?.lastActivityAt).toBe(receivedAt);
		expect(state.caseRecord?.updatedAt).toBeGreaterThan(100);
		expect(state.caseRecord?.status).toBe("needs_attention");
	});

	it("backfills legacy notes without deleting or changing their content", async () => {
		const { base, actorMemberId, firstCaseId } =
			await createCaseLinkingFixture();
		const legacyEventId = await base.run(async (ctx) =>
			ctx.db.insert("caseEvents", {
				caseId: firstCaseId,
				body: "Existing production note",
				occurredAt: 500,
				createdAt: 500,
				createdByMemberId: actorMemberId,
			}),
		);

		await base.mutation(internal.migrations.typeLegacyCaseEventsAsHumanNotes, {
			oneBatchOnly: true,
			cursor: null,
			dryRun: false,
		});

		expect(
			await base.run(async (ctx) => ctx.db.get(legacyEventId)),
		).toMatchObject({
			_id: legacyEventId,
			type: "human_note",
			body: "Existing production note",
			occurredAt: 500,
		});
	});
});
