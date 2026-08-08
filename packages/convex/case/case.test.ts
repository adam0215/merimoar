/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { CASE_EMBEDDING_DIMENSIONS } from "#/case/embeddingModel";
import type { CaseViewFilter } from "#/case/model";
import { canonicalCasePair, MAX_CASE_CASE_RELATIONS } from "#/case/relations";
import { createTest, syncWorkosUser } from "#/test.setup";
import { api } from "../_generated/api";

// TEST FIXTURES: The Merimoar organization, people, emails, and WorkOS-style
// identifiers below exist only in convex-test's isolated in-memory database.
const ISSUER = "https://api.workos.com/";
const ADAM_SUBJECT = "user_adam";
const OTHER_SUBJECT = "user_other";
const TEST_CASE_EMBEDDING = Array.from(
	{ length: CASE_EMBEDDING_DIMENSIONS },
	(_, index) => (index === 0 ? 1 : 0),
);

async function createFixture() {
	const base = createTest();
	await Promise.all([
		syncWorkosUser(base, {
			id: ADAM_SUBJECT,
			name: "Adam Gustafsson",
			email: "adam@merimoar.com",
		}),
		syncWorkosUser(base, {
			id: "user_sara",
			name: "Sara Lind",
			email: "sara@merimoar.com",
		}),
		syncWorkosUser(base, {
			id: OTHER_SUBJECT,
			name: "Other User",
			email: "other@example.com",
		}),
	]);
	const ids = await base.run(async (ctx) => {
		const organizationId = await ctx.db.insert("organizations", {
			name: "Merimoar",
			workosOrganizationId: "org_merimoar",
			referenceSlug: "MER",
			active: true,
		});
		const otherOrganizationId = await ctx.db.insert("organizations", {
			name: "Other",
			workosOrganizationId: "org_other",
			referenceSlug: "OTHR",
			active: true,
		});
		const actorMemberId = await ctx.db.insert("organizationMembers", {
			organizationId,
			workosUserId: ADAM_SUBJECT,
			active: true,
		});
		const ownerMemberId = await ctx.db.insert("organizationMembers", {
			organizationId,
			workosUserId: "user_sara",
			active: true,
		});
		await ctx.db.insert("organizationMembers", {
			organizationId: otherOrganizationId,
			workosUserId: OTHER_SUBJECT,
			active: true,
		});
		const contactId = await ctx.db.insert("contacts", {
			organizationId,
			name: "Elin Andersson",
			address: "elin@example.com",
			firstSeenAt: 100,
			lastSeenAt: 200,
		});
		const otherContactId = await ctx.db.insert("contacts", {
			organizationId: otherOrganizationId,
			name: "Other contact",
			address: "other@example.com",
			firstSeenAt: 100,
			lastSeenAt: 200,
		});
		const entityTypeId = await ctx.db.insert("entityTypes", {
			organizationId,
			key: "property",
			name: "Property",
			pluralName: "Properties",
			identifierLabel: "Property ID",
			description: "",
			icon: "home",
			archivedAt: null,
		});
		const entityId = await ctx.db.insert("entities", {
			entityTypeId,
			identifier: "FAST-1",
			normalizedIdentifier: "fast-1",
			displayName: "Storgatan 12",
			createdAt: 100,
			updatedAt: 100,
			archivedAt: null,
		});
		const relatedCaseId = await ctx.db.insert("cases", {
			organizationId,
			reference: "CASE-RELATED",
			title: "Related handover",
			description: "",
			ownerMemberId,
			dueAt: null,
			status: "open",
			lastActivityAt: 100,
			createdAt: 100,
			updatedAt: 100,
		});
		const otherCaseId = await ctx.db.insert("cases", {
			organizationId: otherOrganizationId,
			reference: "CASE-OTHER",
			title: "Other organization case",
			description: "",
			ownerMemberId: null,
			dueAt: null,
			status: "open",
			lastActivityAt: 100,
			createdAt: 100,
			updatedAt: 100,
		});
		return {
			organizationId,
			actorMemberId,
			ownerMemberId,
			contactId,
			otherContactId,
			entityId,
			relatedCaseId,
			otherCaseId,
		};
	});

	return {
		base,
		actor: base.withIdentity({
			issuer: ISSUER,
			subject: ADAM_SUBJECT,
			org_id: "org_merimoar",
		}),
		otherActor: base.withIdentity({
			issuer: ISSUER,
			subject: OTHER_SUBJECT,
			org_id: "org_other",
		}),
		...ids,
	};
}

describe("cases", () => {
	it("lists the five most recently active cases inside the organization", async () => {
		const { actor, base, organizationId } = await createFixture();
		await base.run(async (ctx) => {
			for (let index = 1; index <= 6; index += 1) {
				await ctx.db.insert("cases", {
					organizationId,
					reference: `CASE-RECENT-${index}`,
					title: `Recent case ${index}`,
					description: "",
					ownerMemberId: null,
					dueAt: null,
					status: "open",
					lastActivityAt: index * 1_000,
					createdAt: 100,
					updatedAt: index * 1_000,
				});
			}
		});

		const recentCases = await actor.query(api.case.reader.listRecent, {});
		expect(recentCases.map((caseRecord) => caseRecord.reference)).toEqual([
			"CASE-RECENT-6",
			"CASE-RECENT-5",
			"CASE-RECENT-4",
			"CASE-RECENT-3",
			"CASE-RECENT-2",
		]);
		expect(
			recentCases.every(
				(caseRecord) => caseRecord.organizationId === organizationId,
			),
		).toBe(true);
	});

	it("caps the overview assigned case count only after 99 cases", async () => {
		const { actor, actorMemberId, base, organizationId } =
			await createFixture();
		await base.run(async (ctx) => {
			for (let index = 1; index <= 99; index += 1) {
				await ctx.db.insert("cases", {
					organizationId,
					reference: `CASE-ASSIGNED-${index}`,
					title: `Assigned case ${index}`,
					description: "",
					ownerMemberId: actorMemberId,
					dueAt: null,
					status: "open",
					lastActivityAt: index,
					createdAt: index,
					updatedAt: index,
				});
			}
		});

		expect(await actor.query(api.case.reader.getMyOverviewStats, {})).toEqual({
			assignedCaseCount: 99,
			hasMoreThan99AssignedCases: false,
			latestCaseActivityAt: 99,
		});

		await base.run(async (ctx) => {
			await ctx.db.insert("cases", {
				organizationId,
				reference: "CASE-ASSIGNED-100",
				title: "Assigned case 100",
				description: "",
				ownerMemberId: actorMemberId,
				dueAt: null,
				status: "open",
				lastActivityAt: 100,
				createdAt: 100,
				updatedAt: 100,
			});
		});

		expect(await actor.query(api.case.reader.getMyOverviewStats, {})).toEqual({
			assignedCaseCount: 99,
			hasMoreThan99AssignedCases: true,
			latestCaseActivityAt: 100,
		});
	});

	it("filters cases by the configured views", async () => {
		const { actor, actorMemberId, base, organizationId, ownerMemberId } =
			await createFixture();
		await base.run(async (ctx) => {
			const cases = [
				{
					reference: "CASE-ATTENTION",
					status: "needs_attention" as const,
					ownerMemberId: actorMemberId,
					dueAt: 20_000,
				},
				{
					reference: "CASE-WAITING",
					status: "waiting" as const,
					ownerMemberId: null,
					dueAt: null,
				},
				{
					reference: "CASE-CLEAR",
					status: "clear" as const,
					ownerMemberId: actorMemberId,
					dueAt: 5_000,
				},
				{
					reference: "CASE-CLOSED",
					status: "closed" as const,
					ownerMemberId: null,
					dueAt: 5_000,
				},
				{
					reference: "CASE-OPEN",
					status: "open" as const,
					ownerMemberId,
					dueAt: null,
				},
			];
			await Promise.all(
				cases.map((caseRecord, index) =>
					ctx.db.insert("cases", {
						organizationId,
						reference: caseRecord.reference,
						title: caseRecord.reference,
						description: "",
						ownerMemberId: caseRecord.ownerMemberId,
						dueAt: caseRecord.dueAt,
						status: caseRecord.status,
						lastActivityAt: 1_000 + index,
						createdAt: 100,
						updatedAt: 100,
					}),
				),
			);
		});

		async function listReferences(view: CaseViewFilter) {
			const result = await actor.query(api.case.reader.list, {
				view,
				now: 10_000,
				paginationOpts: { cursor: null, numItems: 20 },
			});
			return result.page.map((item) => item.case.reference);
		}

		expect(await listReferences("needs_attention")).toEqual(["CASE-ATTENTION"]);
		expect(await listReferences("assigned_to_me")).toEqual([
			"CASE-CLEAR",
			"CASE-ATTENTION",
		]);
		expect(await listReferences("unassigned")).toEqual(["CASE-WAITING"]);
		expect(await listReferences("waiting")).toEqual(["CASE-WAITING"]);
		expect(await listReferences("closed")).toEqual(["CASE-CLOSED"]);
		expect(await listReferences("overdue")).toEqual(["CASE-CLEAR"]);
		const defaultView = await actor.query(api.case.reader.list, {
			paginationOpts: { cursor: null, numItems: 20 },
		});
		expect(defaultView.page.map((item) => item.case.reference)).toEqual([
			"CASE-OPEN",
			"CASE-CLOSED",
			"CASE-CLEAR",
			"CASE-WAITING",
			"CASE-ATTENTION",
			"CASE-RELATED",
		]);
		expect(await listReferences("all_open")).toEqual([
			"CASE-OPEN",
			"CASE-CLEAR",
			"CASE-WAITING",
			"CASE-ATTENTION",
			"CASE-RELATED",
		]);
	});

	it("derives tenant and audit actor from WorkOS identity", async () => {
		const {
			actor,
			actorMemberId,
			ownerMemberId,
			contactId,
			entityId,
			relatedCaseId,
		} = await createFixture();
		const caseId = await actor.mutation(api.case.mutations.create, {
			title: "Missing keys before possession",
			description: "Coordinate the handover.",
			ownerMemberId,
			dueAt: 2_000,
			initialEventBody: "Buyer reported two missing keys.",
			contactIds: [contactId],
			entityIds: [entityId],
			relatedCaseIds: [relatedCaseId],
		});

		const [detail, relatedDetail] = await Promise.all([
			actor.query(api.case.reader.get, { caseId }),
			actor.query(api.case.reader.get, { caseId: relatedCaseId }),
		]);
		expect(detail?.case).toMatchObject({
			title: "Missing keys before possession",
			ownerMemberId,
			dueAt: 2_000,
			status: "open",
		});
		expect(detail?.case.reference).toBe("MER-00001");
		expect(detail?.events[0]?.event.createdByMemberId).toBe(actorMemberId);
		expect(detail?.contacts[0]?.relation.addedByMemberId).toBe(actorMemberId);
		expect(detail?.entities[0]?.relation.addedByMemberId).toBe(actorMemberId);
		expect(detail?.relatedCases[0]).toMatchObject({
			relation: { addedByMemberId: actorMemberId },
			relatedCase: { _id: relatedCaseId },
		});
		expect(relatedDetail?.relatedCases[0]).toMatchObject({
			relation: { addedByMemberId: actorMemberId },
			relatedCase: { _id: caseId },
		});
	});

	it("increments the index across prefix changes without rewriting old cases", async () => {
		const { actor, base } = await createFixture();
		const input = {
			title: "Sequential case",
			description: "",
			ownerMemberId: null,
			dueAt: null,
			initialEventBody: "",
			contactIds: [],
			entityIds: [],
			relatedCaseIds: [],
		};
		const firstCaseId = await actor.mutation(api.case.mutations.create, input);
		await actor.mutation(api.organization.settings.updateReferenceSlug, {
			referenceSlug: "ACM",
		});
		const secondCaseId = await actor.mutation(api.case.mutations.create, input);
		const references = await base.run(async (ctx) =>
			Promise.all([
				ctx.db.get("cases", firstCaseId),
				ctx.db.get("cases", secondCaseId),
			]),
		);

		expect(references.map((caseRecord) => caseRecord?.reference)).toEqual([
			"MER-00001",
			"ACM-00002",
		]);
	});

	it("records a case status transition once and attributes it to the actor", async () => {
		const { actor, actorMemberId, base, ownerMemberId } = await createFixture();
		const caseId = await actor.mutation(api.case.mutations.create, {
			title: "Status transition",
			description: "Track one real transition.",
			ownerMemberId,
			dueAt: null,
			initialEventBody: "",
			contactIds: [],
			entityIds: [],
			relatedCaseIds: [],
		});
		const update = {
			caseId,
			title: "Status transition",
			description: "Track one real transition.",
			ownerMemberId,
			dueAt: null,
			status: "waiting" as const,
		};

		await actor.mutation(api.case.mutations.update, update);
		await actor.mutation(api.case.mutations.update, update);

		const state = await base.run(async (ctx) => ({
			caseRecord: await ctx.db.get(caseId),
			statusEvents: (
				await ctx.db
					.query("caseEvents")
					.withIndex("by_case_id_and_occurred_at", (index) =>
						index.eq("caseId", caseId),
					)
					.collect()
			).filter(
				(event) =>
					"type" in event &&
					event.type === "system_change" &&
					event.body === "Case status changed to Waiting.",
			),
		}));

		expect(state.caseRecord?.status).toBe("waiting");
		expect(state.statusEvents).toHaveLength(1);
		expect(state.statusEvents[0]?.createdByMemberId).toBe(actorMemberId);
	});

	it("invalidates and schedules rebuilding an embedding after case details change", async () => {
		const { actor, base, organizationId, ownerMemberId, relatedCaseId } =
			await createFixture();
		const embeddingId = await base.run(async (ctx) =>
			ctx.db.insert("caseEmbeddings", {
				caseId: relatedCaseId,
				organizationId,
				embedding: TEST_CASE_EMBEDDING,
			}),
		);

		await actor.mutation(api.case.mutations.update, {
			caseId: relatedCaseId,
			title: "Related handover",
			description: "The case now has embedding-relevant details.",
			ownerMemberId,
			dueAt: null,
			status: "open",
		});

		const state = await base.run(async (ctx) => ({
			embedding: await ctx.db.get(embeddingId),
			scheduledFunctions: await ctx.db.system
				.query("_scheduled_functions")
				.collect(),
		}));
		expect(state.embedding).toBeNull();
		expect(state.scheduledFunctions).toContainEqual(
			expect.objectContaining({
				name: "case/embedding:embedCase",
				args: [{ caseId: relatedCaseId }],
				state: { kind: "pending" },
			}),
		);
	});

	it("preserves an embedding when changed case details produce the same embedding input", async () => {
		const { actor, base, organizationId, ownerMemberId, relatedCaseId } =
			await createFixture();
		const embeddedSuffix = "x".repeat(6_000);
		const embeddingId = await base.run(async (ctx) => {
			await ctx.db.patch(relatedCaseId, {
				description: `Old truncated prefix${embeddedSuffix}`,
			});
			return await ctx.db.insert("caseEmbeddings", {
				caseId: relatedCaseId,
				organizationId,
				embedding: TEST_CASE_EMBEDDING,
			});
		});

		await actor.mutation(api.case.mutations.update, {
			caseId: relatedCaseId,
			title: "Related handover",
			description: `New truncated prefix${embeddedSuffix}`,
			ownerMemberId,
			dueAt: null,
			status: "open",
		});

		const state = await base.run(async (ctx) => ({
			embedding: await ctx.db.get(embeddingId),
			scheduledFunctions: await ctx.db.system
				.query("_scheduled_functions")
				.collect(),
		}));
		expect(state.embedding).not.toBeNull();
		expect(state.scheduledFunctions).toHaveLength(0);
	});

	it("treats case relations as symmetric without creating reverse duplicates", async () => {
		const { actor, actorMemberId, ownerMemberId, relatedCaseId } =
			await createFixture();
		const caseId = await actor.mutation(api.case.mutations.create, {
			title: "Inspection follow-up",
			description: "",
			ownerMemberId,
			dueAt: null,
			initialEventBody: "",
			contactIds: [],
			entityIds: [],
			relatedCaseIds: [],
		});

		const relationId = await actor.mutation(
			api.case.mutations.addCaseRelation,
			{
				caseId,
				relatedCaseId,
			},
		);
		const duplicateRelationId = await actor.mutation(
			api.case.mutations.addCaseRelation,
			{
				caseId,
				relatedCaseId,
			},
		);
		const reverseDuplicateRelationId = await actor.mutation(
			api.case.mutations.addCaseRelation,
			{
				caseId: relatedCaseId,
				relatedCaseId: caseId,
			},
		);
		expect(duplicateRelationId).toBe(relationId);
		expect(reverseDuplicateRelationId).toBe(relationId);
		const [caseDetailBeforeRemoval, relatedCaseDetailBeforeRemoval] =
			await Promise.all([
				actor.query(api.case.reader.get, { caseId }),
				actor.query(api.case.reader.get, { caseId: relatedCaseId }),
			]);
		expect(
			caseDetailBeforeRemoval?.relatedCases.map(
				({ relatedCase }) => relatedCase?._id,
			),
		).toEqual([relatedCaseId]);
		expect(
			relatedCaseDetailBeforeRemoval?.relatedCases.map(
				({ relatedCase }) => relatedCase?._id,
			),
		).toEqual([caseId]);
		await expect(
			actor.mutation(api.case.mutations.addCaseRelation, {
				caseId,
				relatedCaseId: caseId,
			}),
		).rejects.toThrow("cannot be related to itself");

		await actor.mutation(api.case.mutations.removeCaseRelation, {
			relationId,
		});

		const [caseDetail, relatedCaseDetail, historicalRelation] =
			await Promise.all([
				actor.query(api.case.reader.get, { caseId }),
				actor.query(api.case.reader.get, { caseId: relatedCaseId }),
				actor.run(async (ctx) => ctx.db.get(relationId)),
			]);
		expect(caseDetail?.relatedCases).toHaveLength(0);
		expect(relatedCaseDetail?.relatedCases).toHaveLength(0);
		expect(caseDetail?.events[0]?.event).toHaveProperty(
			"body",
			expect.stringContaining("Removed CASE-RELATED"),
		);
		expect(relatedCaseDetail?.events[0]?.event).toHaveProperty(
			"body",
			expect.stringContaining("Removed MER-00001"),
		);
		expect(historicalRelation).toMatchObject({
			endedAt: expect.any(Number),
			removedByMemberId: actorMemberId,
		});
	});

	it("enforces the related-case limit on both sides of a relation", async () => {
		const {
			actor,
			actorMemberId,
			base,
			organizationId,
			ownerMemberId,
			relatedCaseId,
		} = await createFixture();
		const caseId = await actor.mutation(api.case.mutations.create, {
			title: "Capacity source",
			description: "",
			ownerMemberId,
			dueAt: null,
			initialEventBody: "",
			contactIds: [],
			entityIds: [],
			relatedCaseIds: [],
		});
		await base.run(async (ctx) => {
			for (let index = 0; index < MAX_CASE_CASE_RELATIONS; index += 1) {
				const capacityCaseId = await ctx.db.insert("cases", {
					organizationId,
					reference: `CASE-FULL-${index}`,
					title: `Full-side relation ${index}`,
					description: "",
					ownerMemberId,
					dueAt: null,
					status: "open",
					lastActivityAt: index,
					createdAt: index,
					updatedAt: index,
				});
				await ctx.db.insert("caseCaseRelations", {
					...canonicalCasePair(relatedCaseId, capacityCaseId),
					startedAt: index,
					endedAt: null,
					addedByMemberId: actorMemberId,
					removedByMemberId: null,
				});
			}
		});

		const limitMessage = `A case can have at most ${MAX_CASE_CASE_RELATIONS} related cases`;
		await expect(
			actor.mutation(api.case.mutations.addCaseRelation, {
				caseId,
				relatedCaseId,
			}),
		).rejects.toThrow(limitMessage);
		await expect(
			actor.mutation(api.case.mutations.create, {
				title: "Initial relation over capacity",
				description: "",
				ownerMemberId,
				dueAt: null,
				initialEventBody: "",
				contactIds: [],
				entityIds: [],
				relatedCaseIds: [relatedCaseId],
			}),
		).rejects.toThrow(limitMessage);
	});

	it("preserves relation history and records the removing actor", async () => {
		const { actor, actorMemberId, ownerMemberId, contactId } =
			await createFixture();
		const caseId = await actor.mutation(api.case.mutations.create, {
			title: "Contract amendment",
			description: "",
			ownerMemberId,
			dueAt: null,
			initialEventBody: "",
			contactIds: [contactId],
			entityIds: [],
			relatedCaseIds: [],
		});
		const before = await actor.query(api.case.reader.get, { caseId });
		const relationId = before?.contacts[0]?.relation._id;
		if (!relationId) {
			throw new Error("Missing test relation");
		}

		await actor.mutation(api.case.mutations.removeContactRelation, {
			relationId,
		});

		const after = await actor.query(api.case.reader.get, { caseId });
		const historicalRelation = await actor.run(async (ctx) =>
			ctx.db.get(relationId),
		);
		expect(after?.contacts).toHaveLength(0);
		expect(after?.events[0]?.event).toHaveProperty(
			"body",
			expect.stringContaining("Removed Elin Andersson"),
		);
		expect(after?.events[0]?.event.createdByMemberId).toBe(actorMemberId);
		expect(historicalRelation).toMatchObject({
			endedAt: expect.any(Number),
			removedByMemberId: actorMemberId,
		});
	});

	it("deletes the complete case-owned graph while preserving shared records", async () => {
		const {
			actor,
			actorMemberId,
			base,
			contactId,
			entityId,
			organizationId,
			ownerMemberId,
			relatedCaseId,
		} = await createFixture();
		const caseId = await actor.mutation(api.case.mutations.create, {
			title: "Case to delete",
			description: "Delete the case-owned graph.",
			ownerMemberId,
			dueAt: null,
			initialEventBody: "This event should be deleted.",
			contactIds: [contactId],
			entityIds: [entityId],
			relatedCaseIds: [relatedCaseId],
		});

		const graph = await base.run(async (ctx) => {
			const inboxId = await ctx.db.insert("emailInboxes", {
				organizationId,
				displayName: "Cases",
				address: "cases@example.com",
				status: "active",
				unreadThreadCount: 0,
			});
			const threadId = await ctx.db.insert("emailThreads", {
				organizationId,
				inboxId,
				lastActivityAt: 100,
			});
			const emailRelationId = await ctx.db.insert("caseEmailThreadRelations", {
				caseId,
				threadId,
				startedAt: 100,
				endedAt: null,
				linkedByMemberId: actorMemberId,
				unlinkedByMemberId: null,
			});
			const embeddingId = await ctx.db.insert("caseEmbeddings", {
				caseId,
				organizationId,
				embedding: TEST_CASE_EMBEDDING,
			});
			const taskId = await ctx.db.insert("agentTasks", {
				organizationId,
				anchorCaseId: caseId,
				agentKey: "agent-v1",
				requestedAt: 100,
				requestedBy: "member",
				requestedByMemberId: actorMemberId,
				status: "completed",
				result: "Done",
				ownershipReleasedAt: 200,
				activeRunIds: [],
				activeApprovalIds: [],
			});
			const turnId = await ctx.db.insert("agentTurns", {
				taskId,
				sequence: 0,
				requestedAt: 100,
				requestedBy: "member",
				requestedByMemberId: actorMemberId,
			});
			const runId = await ctx.db.insert("agentRuns", {
				turnId,
				requestedAt: 100,
				attemptCount: 1,
				leaseGeneration: 1,
				status: "completed",
				endedAt: 200,
			});
			const itemId = await ctx.db.insert("agentItems", {
				turnId,
				sequence: 0,
				createdAt: 100,
				kind: "agent_message",
				runId,
				body: "Completed work",
			});
			const integrationId = await ctx.db.insert("customIntegrations", {
				organizationId,
				name: "Case test integration",
				baseUrl: "https://example.com/",
				updatedAt: 100,
			});
			const customToolId = await ctx.db.insert("agentCustomTools", {
				agentKey: "agent-v1",
				integrationId,
				name: "Case test tool",
				normalizedName: "case_test_tool",
				description: "Tests case deletion.",
				path: "case-test",
				parameters: [],
				requiresApproval: false,
				testedConfigurationHash: "hash",
				updatedAt: 100,
			});
			const customToolDefinitionId = await ctx.db.insert(
				"agentRunCustomToolDefinitions",
				{
					runId,
					toolId: customToolId,
					normalizedName: "case_test_tool",
					description: "Tests case deletion.",
					parameters: [],
					requiresApproval: false,
					baseUrl: "https://example.com/",
					path: "case-test",
					configurationHash: "hash",
				},
			);
			const caseRecord = await ctx.db.get(caseId);
			if (!caseRecord?.globalSearchEntryId) {
				throw new Error("Expected case search entry");
			}

			return {
				customToolDefinitionId,
				customToolId,
				emailRelationId,
				embeddingId,
				globalSearchEntryId: caseRecord.globalSearchEntryId,
				integrationId,
				itemId,
				runId,
				taskId,
				threadId,
				turnId,
			};
		});

		await actor.mutation(api.case.mutations.remove, { caseId });

		const state = await base.run(async (ctx) => ({
			caseRecord: await ctx.db.get(caseId),
			contact: await ctx.db.get(contactId),
			customTool: await ctx.db.get(graph.customToolId),
			customToolDefinition: await ctx.db.get(graph.customToolDefinitionId),
			emailRelation: await ctx.db.get(graph.emailRelationId),
			embedding: await ctx.db.get(graph.embeddingId),
			entity: await ctx.db.get(entityId),
			globalSearchEntry: await ctx.db.get(graph.globalSearchEntryId),
			integration: await ctx.db.get(graph.integrationId),
			item: await ctx.db.get(graph.itemId),
			relatedCase: await ctx.db.get(relatedCaseId),
			run: await ctx.db.get(graph.runId),
			task: await ctx.db.get(graph.taskId),
			thread: await ctx.db.get(graph.threadId),
			turn: await ctx.db.get(graph.turnId),
			caseEvents: await ctx.db
				.query("caseEvents")
				.withIndex("by_case_id_and_occurred_at", (index) =>
					index.eq("caseId", caseId),
				)
				.collect(),
			contactRelations: await ctx.db
				.query("caseContactRelations")
				.withIndex("by_case_id_and_ended_at", (index) =>
					index.eq("caseId", caseId),
				)
				.collect(),
			entityRelations: await ctx.db
				.query("caseEntityRelations")
				.withIndex("by_case_id_and_ended_at", (index) =>
					index.eq("caseId", caseId),
				)
				.collect(),
			caseRelationsAsParent: await ctx.db
				.query("caseCaseRelations")
				.withIndex("by_case_id_and_ended_at", (index) =>
					index.eq("caseId", caseId),
				)
				.collect(),
			caseRelationsAsRelated: await ctx.db
				.query("caseCaseRelations")
				.withIndex("by_related_case_id_and_ended_at", (index) =>
					index.eq("relatedCaseId", caseId),
				)
				.collect(),
		}));

		expect(state).toMatchObject({
			caseRecord: null,
			customToolDefinition: null,
			emailRelation: null,
			embedding: null,
			globalSearchEntry: null,
			item: null,
			run: null,
			task: null,
			turn: null,
			caseEvents: [],
			contactRelations: [],
			entityRelations: [],
			caseRelationsAsParent: [],
			caseRelationsAsRelated: [],
		});
		expect(state.contact).not.toBeNull();
		expect(state.customTool).not.toBeNull();
		expect(state.entity).not.toBeNull();
		expect(state.integration).not.toBeNull();
		expect(state.relatedCase).not.toBeNull();
		expect(state.thread).not.toBeNull();
	});

	it("does not delete a case while an agent owns it", async () => {
		const { actor, actorMemberId, base, organizationId, relatedCaseId } =
			await createFixture();
		await base.run(async (ctx) => {
			await ctx.db.insert("agentTasks", {
				organizationId,
				anchorCaseId: relatedCaseId,
				agentKey: "agent-v1",
				requestedAt: 100,
				requestedBy: "member",
				requestedByMemberId: actorMemberId,
				status: "active",
				ownershipReleasedAt: null,
				activeRunIds: [],
				activeApprovalIds: [],
			});
		});

		await expect(
			actor.mutation(api.case.mutations.remove, { caseId: relatedCaseId }),
		).rejects.toThrow("Agent is working on this case");
		expect(
			await base.run(async (ctx) => ctx.db.get(relatedCaseId)),
		).not.toBeNull();
	});

	it("rejects unauthenticated calls", async () => {
		const { base, ownerMemberId, relatedCaseId } = await createFixture();
		await expect(
			base.mutation(api.case.mutations.create, {
				title: "Unauthenticated",
				description: "",
				ownerMemberId,
				dueAt: null,
				initialEventBody: "",
				contactIds: [],
				entityIds: [],
				relatedCaseIds: [],
			}),
		).rejects.toThrow("Sign in");
		await expect(
			base.query(api.case.reader.getCreateOptions, {}),
		).rejects.toThrow("Sign in");
		await expect(
			base.mutation(api.case.mutations.remove, { caseId: relatedCaseId }),
		).rejects.toThrow("Sign in");
	});

	it("prevents cross-tenant reads, writes, and relations", async () => {
		const { actor, otherActor, ownerMemberId, otherContactId, otherCaseId } =
			await createFixture();
		await expect(
			actor.mutation(api.case.mutations.create, {
				title: "Invalid relation",
				description: "",
				ownerMemberId,
				dueAt: null,
				initialEventBody: "",
				contactIds: [otherContactId],
				entityIds: [],
				relatedCaseIds: [],
			}),
		).rejects.toThrow("does not belong");
		await expect(
			actor.mutation(api.case.mutations.create, {
				title: "Invalid case relation",
				description: "",
				ownerMemberId,
				dueAt: null,
				initialEventBody: "",
				contactIds: [],
				entityIds: [],
				relatedCaseIds: [otherCaseId],
			}),
		).rejects.toThrow("does not belong");

		const caseId = await actor.mutation(api.case.mutations.create, {
			title: "Tenant-owned case",
			description: "",
			ownerMemberId,
			dueAt: null,
			initialEventBody: "",
			contactIds: [],
			entityIds: [],
			relatedCaseIds: [],
		});
		expect(await otherActor.query(api.case.reader.get, { caseId })).toBeNull();
		const createOptions = await actor.query(
			api.case.reader.getCreateOptions,
			{},
		);
		expect(createOptions.cases.map((caseOption) => caseOption._id)).toContain(
			caseId,
		);
		expect(
			createOptions.cases.map((caseOption) => caseOption._id),
		).not.toContain(otherCaseId);
		await expect(
			actor.mutation(api.case.mutations.addCaseRelation, {
				caseId,
				relatedCaseId: otherCaseId,
			}),
		).rejects.toThrow("does not belong");
		await expect(
			otherActor.mutation(api.case.mutations.update, {
				caseId,
				title: "Cross-tenant update",
				description: "",
				ownerMemberId: null,
				dueAt: null,
				status: "open",
			}),
		).rejects.toThrow("could not be found");
		await expect(
			otherActor.mutation(api.case.mutations.remove, { caseId }),
		).rejects.toThrow("could not be found");
		expect(await actor.query(api.case.reader.get, { caseId })).not.toBeNull();
	});

	it("normalizes inline events and attributes them to the actor", async () => {
		const { actor, actorMemberId, ownerMemberId } = await createFixture();
		const caseId = await actor.mutation(api.case.mutations.create, {
			title: "Photography rescheduling",
			description: "",
			ownerMemberId,
			dueAt: null,
			initialEventBody: "",
			contactIds: [],
			entityIds: [],
			relatedCaseIds: [],
		});
		const before = await actor.run(async (ctx) => ctx.db.get(caseId));

		await actor.mutation(api.case.mutations.addEvent, {
			caseId,
			body: "  New appointment confirmed.  ",
		});

		const detail = await actor.query(api.case.reader.get, { caseId });
		expect(detail?.events[0]?.event).toMatchObject({
			body: "New appointment confirmed.",
			createdByMemberId: actorMemberId,
		});
		expect(detail?.case.lastActivityAt).toBeGreaterThanOrEqual(
			before?.lastActivityAt ?? 0,
		);
	});

	it("accepts case descriptions without a character limit", async () => {
		const { actor, ownerMemberId } = await createFixture();
		const description = `<p>${"Detailed handover context. ".repeat(250)}</p>`;
		const caseId = await actor.mutation(api.case.mutations.create, {
			title: "Long handover context",
			description,
			ownerMemberId,
			dueAt: null,
			initialEventBody: "",
			contactIds: [],
			entityIds: [],
			relatedCaseIds: [],
		});

		const detail = await actor.query(api.case.reader.get, { caseId });
		expect(description.length).toBeGreaterThan(4_000);
		expect(detail?.case.description).toBe(description);
	});
});
