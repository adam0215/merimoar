import { describe, expect, it } from "vitest";
import { MAX_CASE_CASE_RELATIONS } from "#/case/relations";
import { api } from "../_generated/api";
import {
	createFixture,
	delegateAndClaim,
	finishWithTaskStatus,
	insertCase,
	loadCompleteRuntimeTranscript,
	RUNTIME_SECRET,
	startTool,
} from "./testSupport.test-helper";

describe("agent tools and projections", () => {
	it("commits each mutating tool effect and result atomically by tool call id", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);

		await startTool(fixture, claim, "create-once", "create_case");
		const createInput = {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
			toolCallId: "create-once",
			title: "Created once",
			description: "Idempotent related work.",
			dueAt: null,
		};
		const firstCaseId = await fixture.base.mutation(
			api.agent.tools.createCase,
			createInput,
		);
		expect(
			await fixture.base.mutation(api.agent.tools.createCase, createInput),
		).toBe(firstCaseId);
		await fixture.base.mutation(api.agent.runtime.recordToolFinished, {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
			toolCallId: "create-once",
			result: {
				status: "failed",
				error: "A stale observer must not overwrite the committed effect.",
			},
		});
		expect(
			await fixture.base.mutation(api.agent.tools.createCase, createInput),
		).toBe(firstCaseId);

		await startTool(fixture, claim, "update-once", "update_case");
		const updateInput = {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
			toolCallId: "update-once",
			caseId: fixture.caseId,
			title: "Updated once",
			description: "The current, durable case understanding.",
			status: "closed" as const,
		};
		expect(
			await fixture.base.mutation(api.agent.tools.updateCase, updateInput),
		).toBe(fixture.caseId);
		expect(
			await fixture.base.mutation(api.agent.tools.updateCase, updateInput),
		).toBe(fixture.caseId);

		const state = await fixture.base.run(async (ctx) => ({
			createdCases: await ctx.db
				.query("cases")
				.withIndex("by_organization_id_and_reference", (index) =>
					index.eq("organizationId", fixture.organizationId),
				)
				.collect(),
			events: await ctx.db
				.query("caseEvents")
				.withIndex("by_case_id_and_occurred_at", (index) =>
					index.eq("caseId", fixture.caseId),
				)
				.collect(),
			items: await ctx.db
				.query("agentItems")
				.withIndex("by_turn_id_and_sequence", (index) =>
					index.eq("turnId", claim.turnId),
				)
				.collect(),
		}));
		expect(
			state.createdCases.filter(
				(caseRecord) => caseRecord.title === "Created once",
			),
		).toHaveLength(1);
		expect(
			state.createdCases.find(
				(caseRecord) => caseRecord.title === "Created once",
			)?.reference,
		).toBe("AGNT-00001");
		expect(
			state.events.filter(
				(event) =>
					"type" in event &&
					event.type === "agent_change" &&
					event.agentTaskId === claim.taskId,
			),
		).toHaveLength(2);
		expect(
			state.events
				.filter((event) => "type" in event && event.type === "agent_change")
				.map((event) => event.body),
		).toEqual([
			"Agent updated the case description.",
			"Agent changed the case status from Open to Closed.",
		]);
		expect(
			state.items.filter(
				(item) => item.kind === "tool" && item.status === "completed",
			),
		).toHaveLength(2);
		const corruptReplayTargets = await fixture.base.run(async (ctx) => {
			const createItem = state.items.find(
				(item) => item.kind === "tool" && item.toolCallId === "create-once",
			);
			const updateItem = state.items.find(
				(item) => item.kind === "tool" && item.toolCallId === "update-once",
			);
			if (!createItem || !updateItem) {
				throw new Error("Expected committed tool ledger entries");
			}
			await ctx.db.patch(createItem._id, {
				outputJson: JSON.stringify(fixture.otherCaseId),
			});
			await ctx.db.patch(updateItem._id, {
				outputJson: JSON.stringify(fixture.otherCaseId),
			});
			return { createItemId: createItem._id, updateItemId: updateItem._id };
		});
		expect(corruptReplayTargets).toMatchObject({
			createItemId: expect.any(String),
			updateItemId: expect.any(String),
		});
		await expect(
			fixture.base.mutation(api.agent.tools.createCase, createInput),
		).rejects.toThrow("Invalid durable create_case result");
		await expect(
			fixture.base.mutation(api.agent.tools.updateCase, updateInput),
		).rejects.toThrow("Invalid durable tool result");
	});

	it("enforces the canonical related-case limit when creating a case", async () => {
		const fixture = await createFixture();
		await fixture.base.run(async (ctx) => {
			for (let index = 1; index < MAX_CASE_CASE_RELATIONS; index += 1) {
				const relatedCaseId = await insertCase(
					ctx,
					fixture.organizationId,
					`CASE-CAPACITY-${index}`,
					`Capacity case ${index}`,
				);
				const [caseId, canonicalRelatedCaseId] =
					fixture.caseId < relatedCaseId
						? [fixture.caseId, relatedCaseId]
						: [relatedCaseId, fixture.caseId];
				await ctx.db.insert("caseCaseRelations", {
					caseId,
					relatedCaseId: canonicalRelatedCaseId,
					startedAt: index,
					endedAt: null,
					addedByMemberId: fixture.memberId,
					removedByMemberId: null,
				});
			}
		});
		const claim = await delegateAndClaim(fixture);
		await startTool(fixture, claim, "create-over-capacity", "create_case");

		await expect(
			fixture.base.mutation(api.agent.tools.createCase, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				toolCallId: "create-over-capacity",
				title: "One relation too many",
				description: "This case must not be created.",
				dueAt: null,
			}),
		).rejects.toThrow(
			`A case can have at most ${MAX_CASE_CASE_RELATIONS} related cases`,
		);
	});

	it("adds normalized case relations idempotently without moving email from another case", async () => {
		const fixture = await createFixture();
		const targets = await fixture.base.run(async (ctx) => {
			const entity = await ctx.db.get(fixture.entityId);
			const thread = await ctx.db.get(fixture.unlinkedThreadId);
			if (!entity || !thread) throw new Error("Expected fixture records");
			const contactId = await ctx.db.insert("contacts", {
				organizationId: fixture.organizationId,
				address: "related-contact@example.com",
				name: "Related Contact",
				firstSeenAt: 200,
				lastSeenAt: 200,
			});
			const entityId = await ctx.db.insert("entities", {
				entityTypeId: entity.entityTypeId,
				identifier: "RELATED-ENTITY",
				normalizedIdentifier: "related-entity",
				displayName: "Related Entity",
				createdAt: 200,
				updatedAt: 200,
				archivedAt: null,
			});
			const relatedCaseId = await insertCase(
				ctx,
				fixture.organizationId,
				"CASE-RELATED-AGENT",
				"Related by agent",
			);
			const alreadyLinkedThreadId = await ctx.db.insert("emailThreads", {
				organizationId: fixture.organizationId,
				inboxId: thread.inboxId,
				lastActivityAt: 200,
			});
			await ctx.db.insert("caseEmailThreadRelations", {
				caseId: fixture.secondCaseId,
				threadId: alreadyLinkedThreadId,
				startedAt: 200,
				endedAt: null,
				linkedByMemberId: fixture.memberId,
				unlinkedByMemberId: null,
			});
			return {
				alreadyLinkedThreadId,
				contactId,
				entityId,
				relatedCaseId,
			};
		});
		const claim = await delegateAndClaim(fixture);
		const baseInput = {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
			caseId: fixture.caseId,
		};

		await startTool(fixture, claim, "relate-contact", "add_case_relation");
		const contactRelationId = await fixture.base.mutation(
			api.agent.tools.addCaseRelation,
			{
				...baseInput,
				toolCallId: "relate-contact",
				relation: { kind: "contact", contactId: targets.contactId },
			},
		);

		await startTool(fixture, claim, "relate-entity", "add_case_relation");
		const entityInput = {
			...baseInput,
			toolCallId: "relate-entity",
			relation: { kind: "entity" as const, entityId: targets.entityId },
		};
		const entityRelationId = await fixture.base.mutation(
			api.agent.tools.addCaseRelation,
			entityInput,
		);
		expect(
			await fixture.base.mutation(api.agent.tools.addCaseRelation, entityInput),
		).toBe(entityRelationId);
		await startTool(
			fixture,
			claim,
			"relate-existing-entity",
			"add_case_relation",
		);
		expect(
			await fixture.base.mutation(api.agent.tools.addCaseRelation, {
				...entityInput,
				toolCallId: "relate-existing-entity",
			}),
		).toBe(entityRelationId);

		await startTool(fixture, claim, "relate-case", "add_case_relation");
		const caseRelationId = await fixture.base.mutation(
			api.agent.tools.addCaseRelation,
			{
				...baseInput,
				toolCallId: "relate-case",
				relation: {
					kind: "case",
					relatedCaseId: targets.relatedCaseId,
				},
			},
		);

		await startTool(fixture, claim, "relate-email", "add_case_relation");
		const emailRelationId = await fixture.base.mutation(
			api.agent.tools.addCaseRelation,
			{
				...baseInput,
				toolCallId: "relate-email",
				relation: {
					kind: "email_thread",
					threadId: fixture.unlinkedThreadId,
				},
			},
		);

		await startTool(fixture, claim, "reject-email-move", "add_case_relation");
		await expect(
			fixture.base.mutation(api.agent.tools.addCaseRelation, {
				...baseInput,
				toolCallId: "reject-email-move",
				relation: {
					kind: "email_thread",
					threadId: targets.alreadyLinkedThreadId,
				},
			}),
		).rejects.toThrow("already linked to another case");

		const state = await fixture.base.run(async (ctx) => ({
			caseRelation: await ctx.db.get(caseRelationId),
			contactRelation: await ctx.db.get(contactRelationId),
			emailRelation: await ctx.db.get(emailRelationId),
			entityRelation: await ctx.db.get(entityRelationId),
			events: await ctx.db
				.query("caseEvents")
				.withIndex("by_case_id_and_occurred_at", (index) =>
					index.eq("caseId", fixture.caseId),
				)
				.collect(),
			relatedCaseEvents: await ctx.db
				.query("caseEvents")
				.withIndex("by_case_id_and_occurred_at", (index) =>
					index.eq("caseId", targets.relatedCaseId),
				)
				.collect(),
		}));
		expect(state.contactRelation).toMatchObject({
			caseId: fixture.caseId,
			contactId: targets.contactId,
			addedByMemberId: null,
			endedAt: null,
		});
		expect(state.entityRelation).toMatchObject({
			caseId: fixture.caseId,
			entityId: targets.entityId,
			addedByMemberId: null,
			endedAt: null,
		});
		expect(state.caseRelation).toMatchObject({
			addedByMemberId: null,
			endedAt: null,
		});
		expect(state.emailRelation).toMatchObject({
			caseId: fixture.caseId,
			threadId: fixture.unlinkedThreadId,
			linkedByMemberId: null,
			endedAt: null,
		});
		expect(
			state.events.filter(
				(event) =>
					"type" in event &&
					event.type === "agent_change" &&
					event.agentTaskId === claim.taskId,
			),
		).toHaveLength(4);
		expect(state.relatedCaseEvents).toEqual([
			expect.objectContaining({
				type: "agent_change",
				agentTaskId: claim.taskId,
			}),
		]);
	});

	it("claims a task with another persisted agent key", async () => {
		const fixture = await createFixture();
		const delegation = await fixture.actor.mutation(
			api.agent.tasks.delegateCase,
			{ caseId: fixture.caseId, input: "Run an old persisted agent." },
		);
		await fixture.base.run(async (ctx) => {
			await ctx.db.patch(delegation.taskId, { agentKey: "other-agent" });
		});

		const claim = await fixture.base.mutation(api.agent.runtime.claimRun, {
			runtimeSecret: RUNTIME_SECRET,
			runId: delegation.runId,
			leaseGeneration: 0,
			claimToken: crypto.randomUUID(),
			leaseDurationMs: 60_000,
		});
		const state = await fixture.base.run(async (ctx) => ({
			task: await ctx.db.get(delegation.taskId),
			run: await ctx.db.get(delegation.runId),
		}));
		expect(claim).toMatchObject({
			runId: delegation.runId,
			taskId: delegation.taskId,
			agentKey: "other-agent",
		});
		expect(state.task).toMatchObject({
			status: "active",
			ownershipReleasedAt: null,
		});
		expect(state.run).toMatchObject({
			status: "running",
		});
	});

	it("returns the complete transcript without turn, item, or byte caps", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		await fixture.base.run(async (ctx) => {
			for (let sequence = 2; sequence <= 65; sequence += 1) {
				const turnId = await ctx.db.insert("agentTurns", {
					taskId: claim.taskId,
					sequence,
					requestedAt: sequence,
					requestedBy: "system:testHistory",
				});
				await ctx.db.insert("agentItems", {
					turnId,
					sequence: 1,
					createdAt: sequence,
					kind: "system_message",
					body: `Historical turn ${sequence}`,
					source: "system:testHistory",
				});
				const historicalRunId = await ctx.db.insert("agentRuns", {
					turnId,
					status: "completed",
					requestedAt: sequence,
					attemptCount: 1,
					leaseGeneration: 1,
					endedAt: sequence,
				});
				if (sequence === 65) {
					for (let itemSequence = 2; itemSequence <= 13; itemSequence += 1) {
						await ctx.db.insert("agentItems", {
							turnId,
							sequence: itemSequence,
							createdAt: itemSequence,
							kind: "agent_message",
							runId: historicalRunId,
							body: "x".repeat(40_000),
						});
					}
				}
			}
		});

		const transcript = await loadCompleteRuntimeTranscript(fixture, claim);
		expect(transcript.turns).toHaveLength(65);
		expect(transcript.turns[0]).toMatchObject({ sequence: 1 });
		expect(transcript.turns[0]?.items[0]).toMatchObject({
			kind: "member_message",
			body: "Resolve the case and document the outcome.",
		});
		expect(transcript.turns[1]).toMatchObject({ sequence: 2 });
		expect(transcript.turns.at(-1)).toMatchObject({ sequence: 65 });
		expect(transcript.turns.at(-1)?.items).toHaveLength(13);
		expect(JSON.stringify(transcript).length).toBeGreaterThan(480_000);

		await finishWithTaskStatus(fixture, claim, {
			status: "completed",
			result: "Completed after reading the full history.",
		});
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(claim.taskId)),
		).toMatchObject({
			status: "completed",
			activeRunIds: [],
			activeApprovalIds: [],
			ownershipReleasedAt: expect.any(Number),
		});
	});

	it("enforces runtime authentication and organization isolation in tool execution", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		await expect(
			fixture.base.mutation(api.agent.tools.readCase, {
				runtimeSecret: "wrong-secret-that-is-long-enough-for-an-attempt",
				runId: claim.runId,
				claimToken: claim.claimToken,
				caseId: fixture.caseId,
			}),
		).rejects.toThrow("access denied");
		expect(
			await fixture.base.mutation(api.agent.tools.readCase, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				caseId: fixture.otherCaseId,
			}),
		).toBeNull();
		await startTool(fixture, claim, "cross-tenant-update", "update_case");
		await expect(
			fixture.base.mutation(api.agent.tools.updateCase, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				toolCallId: "cross-tenant-update",
				caseId: fixture.otherCaseId,
				title: "Cross-tenant write",
			}),
		).rejects.toThrow("case could not be found");
		await startTool(
			fixture,
			claim,
			"cross-tenant-relation",
			"add_case_relation",
		);
		await expect(
			fixture.base.mutation(api.agent.tools.addCaseRelation, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				toolCallId: "cross-tenant-relation",
				caseId: fixture.caseId,
				relation: {
					kind: "case",
					relatedCaseId: fixture.otherCaseId,
				},
			}),
		).rejects.toThrow("case could not be found");
	});

	it("inspects active entity fields after a long archived definition history", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		await fixture.base.run(async (ctx) => {
			const entity = await ctx.db.get(fixture.entityId);
			if (!entity) throw new Error("Expected fixture entity");
			for (let position = 0; position < 55; position += 1) {
				await ctx.db.insert("entityFieldDefinitions", {
					entityTypeId: entity.entityTypeId,
					label: `Archived ${position}`,
					valueType: "text",
					required: false,
					position,
					archivedAt: position + 1,
				});
			}
			const activeDefinitionId = await ctx.db.insert("entityFieldDefinitions", {
				entityTypeId: entity.entityTypeId,
				label: "Active after archives",
				valueType: "text",
				required: true,
				position: 55,
				archivedAt: null,
			});
			await ctx.db.insert("entityTextFieldValues", {
				entityId: entity._id,
				fieldDefinitionId: activeDefinitionId,
				value: "Visible value",
			});
		});
		expect(
			await fixture.base.mutation(api.agent.tools.inspectEntity, {
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				entityId: fixture.entityId,
			}),
		).toMatchObject({
			fields: [
				{
					label: "Active after archives",
					value: "Visible value",
				},
			],
		});
	});
});
