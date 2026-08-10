import { v } from "convex/values";
import * as validation from "valibot";
import { requireAgentRuntimeSecret } from "#/agent/access";
import {
	commitMutatingToolResult,
	requireCompletedToolOutput,
	requireMutatingToolLedger,
	requirePersistedCaseRelation,
	requirePersistedCaseUpdate,
	requirePersistedCreatedCase,
	requireRunOrganization,
} from "#/agent/toolLedger";
import {
	invalidPersistedAgentData,
	readCaseResultValidator,
	validateEmailMessageLinks,
} from "#/agent/toolReadModel";
import {
	requireAgentTaskCaseWriteAccess,
	requireCase,
	requireHumanCaseWriteAccess,
} from "#/case/access";
import {
	getActiveCaseRelationForEmailThread,
	linkEmailThreadToCase,
} from "#/case/emailRelations";
import { appendAgentChangeCaseEvent } from "#/case/events";
import { caseDetailsInputSchema } from "#/case/input";
import { CASE_STATUS_LABELS, caseStatusValidator } from "#/case/model";
import { generateNextCaseReference } from "#/case/reference";
import {
	addContactCaseRelation,
	addEntityCaseRelation,
	addRelatedCaseRelation,
	canonicalCasePair,
	listActiveCaseRelations,
	requireCaseCanAddRelatedCase,
} from "#/case/relations";
import { dispatchDomainEvent } from "#/domainEvents";
import { syncGlobalSearchEntry } from "#/globalSearch/model";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { mutation } from "../../_generated/server";
import { invalidAgentTool, mutatingRuntimeArgs, runtimeArgs } from "./shared";

const MAX_CASE_EVENTS = 100;
const MAX_RELATIONS_PER_KIND = 50;

const caseRelationTargetValidator = v.union(
	v.object({
		kind: v.literal("contact"),
		contactId: v.id("contacts"),
	}),
	v.object({
		kind: v.literal("entity"),
		entityId: v.id("entities"),
	}),
	v.object({
		kind: v.literal("case"),
		relatedCaseId: v.id("cases"),
	}),
	v.object({
		kind: v.literal("email_thread"),
		threadId: v.id("emailThreads"),
	}),
);

const caseRelationIdValidator = v.union(
	v.id("caseContactRelations"),
	v.id("caseEntityRelations"),
	v.id("caseCaseRelations"),
	v.id("caseEmailThreadRelations"),
);

function parseCaseDetails(input: {
	title: string;
	description: string;
	dueAt: number | null;
	status: Doc<"cases">["status"];
}) {
	const parsed = validation.safeParse(caseDetailsInputSchema, input);
	if (!parsed.success) {
		throw invalidAgentTool(
			parsed.issues[0]?.message ?? "Enter valid case details.",
		);
	}
	return parsed.output;
}

export function createCaseTools() {
	const readCase = mutation({
		args: {
			...runtimeArgs,
			caseId: v.id("cases"),
		},
		returns: readCaseResultValidator,
		handler: async (ctx, args) => {
			requireAgentRuntimeSecret(args.runtimeSecret);
			const { organizationId } = await requireRunOrganization(ctx, args);
			const caseRecord = await ctx.db.get(args.caseId);
			if (!caseRecord || caseRecord.organizationId !== organizationId) {
				return null;
			}
			const [events, contacts, entities, caseRelations, emailThreads] =
				await Promise.all([
					ctx.db
						.query("caseEvents")
						.withIndex("by_case_id_and_occurred_at", (index) =>
							index.eq("caseId", caseRecord._id),
						)
						.order("desc")
						.take(MAX_CASE_EVENTS),
					ctx.db
						.query("caseContactRelations")
						.withIndex("by_case_id_and_ended_at", (index) =>
							index.eq("caseId", caseRecord._id).eq("endedAt", null),
						)
						.take(MAX_RELATIONS_PER_KIND),
					ctx.db
						.query("caseEntityRelations")
						.withIndex("by_case_id_and_ended_at", (index) =>
							index.eq("caseId", caseRecord._id).eq("endedAt", null),
						)
						.take(MAX_RELATIONS_PER_KIND),
					listActiveCaseRelations(ctx, caseRecord._id),
					ctx.db
						.query("caseEmailThreadRelations")
						.withIndex("by_case_id_and_ended_at", (index) =>
							index.eq("caseId", caseRecord._id).eq("endedAt", null),
						)
						.take(MAX_RELATIONS_PER_KIND),
				]);
			const [
				eventSummaries,
				contactIds,
				entityIds,
				relatedCaseIds,
				emailThreadIds,
			] = await Promise.all([
				Promise.all(
					events.map(async (event) => {
						if (event.createdByMemberId) {
							const author = await ctx.db.get(event.createdByMemberId);
							if (!author || author.organizationId !== organizationId) {
								invalidPersistedAgentData(
									"case event author belongs to another organization",
								);
							}
						}
						if (!("type" in event) || event.type === "human_note") {
							return {
								kind: "human_note" as const,
								body: event.body,
								occurredAt: event.occurredAt,
							};
						}
						if (event.type === "system_change") {
							return {
								kind: "system_change" as const,
								body: event.body,
								occurredAt: event.occurredAt,
							};
						}
						if (event.type === "agent_note" || event.type === "agent_change") {
							const task = await ctx.db.get(event.agentTaskId);
							const taskAnchorCase = task
								? await ctx.db.get(task.anchorCaseId)
								: null;
							if (
								!task ||
								task.organizationId !== organizationId ||
								!taskAnchorCase ||
								taskAnchorCase.organizationId !== task.organizationId
							) {
								invalidPersistedAgentData(
									"agent case event belongs to another organization",
								);
							}
							return {
								kind: event.type,
								body: event.body,
								occurredAt: event.occurredAt,
							};
						}
						const message = await ctx.db.get(event.emailMessageId);
						const thread = message ? await ctx.db.get(message.threadId) : null;
						if (
							!message ||
							!thread ||
							thread.organizationId !== organizationId
						) {
							invalidPersistedAgentData(
								"case email event belongs to another organization",
							);
						}
						await validateEmailMessageLinks(ctx, {
							message,
							thread,
							organizationId,
						});
						return {
							kind: event.type,
							emailMessageId: event.emailMessageId,
							occurredAt: event.occurredAt,
						};
					}),
				),
				Promise.all(
					contacts.map(async (relation) => {
						const contact = await ctx.db.get(relation.contactId);
						if (!contact || contact.organizationId !== organizationId) {
							invalidPersistedAgentData(
								"case contact relation belongs to another organization",
							);
						}
						return contact._id;
					}),
				),
				Promise.all(
					entities.map(async (relation) => {
						const entity = await ctx.db.get(relation.entityId);
						const entityType = entity
							? await ctx.db.get(entity.entityTypeId)
							: null;
						if (
							!entity ||
							entity.archivedAt !== null ||
							!entityType ||
							entityType.organizationId !== organizationId
						) {
							invalidPersistedAgentData(
								"case entity relation belongs to another organization",
							);
						}
						return entity._id;
					}),
				),
				Promise.all(
					caseRelations.map(async (relation) => {
						const relatedCaseId =
							relation.caseId === caseRecord._id
								? relation.relatedCaseId
								: relation.caseId;
						if (relatedCaseId === caseRecord._id) {
							invalidPersistedAgentData("case has a self relation");
						}
						const relatedCase = await ctx.db.get(relatedCaseId);
						if (!relatedCase || relatedCase.organizationId !== organizationId) {
							invalidPersistedAgentData(
								"related case belongs to another organization",
							);
						}
						return relatedCase._id;
					}),
				),
				Promise.all(
					emailThreads.map(async (relation) => {
						const thread = await ctx.db.get(relation.threadId);
						const inbox = thread ? await ctx.db.get(thread.inboxId) : null;
						if (
							!thread ||
							thread.organizationId !== organizationId ||
							!inbox ||
							inbox.organizationId !== organizationId
						) {
							invalidPersistedAgentData(
								"case email relation belongs to another organization",
							);
						}
						return thread._id;
					}),
				),
			]);
			return {
				case: {
					id: caseRecord._id,
					reference: caseRecord.reference,
					title: caseRecord.title,
					description: caseRecord.description,
					dueAt: caseRecord.dueAt,
					status: caseRecord.status,
				},
				events: eventSummaries,
				contactIds,
				entityIds,
				relatedCaseIds,
				emailThreadIds,
			};
		},
	});

	const createCase = mutation({
		args: {
			...mutatingRuntimeArgs,
			title: v.string(),
			description: v.string(),
			dueAt: v.union(v.number(), v.null()),
		},
		returns: v.id("cases"),
		handler: async (ctx, args) => {
			requireAgentRuntimeSecret(args.runtimeSecret);
			const { anchorCase, item, organizationId, task } =
				await requireMutatingToolLedger(ctx, args, "create_case");
			if (item.status === "completed") {
				return await requirePersistedCreatedCase(ctx, {
					outputJson: requireCompletedToolOutput(item),
					organizationId,
					anchorCaseId: anchorCase._id,
				});
			}
			await requireAgentTaskCaseWriteAccess(ctx, anchorCase._id, task._id);
			await requireCaseCanAddRelatedCase(ctx, anchorCase._id);
			const details = parseCaseDetails({
				title: args.title,
				description: args.description,
				dueAt: args.dueAt,
				status: "open",
			});
			const now = Date.now();
			const reference = await generateNextCaseReference(ctx, organizationId);
			const caseId = await ctx.db.insert("cases", {
				organizationId,
				reference,
				title: details.title,
				description: details.description,
				ownerMemberId: null,
				dueAt: details.dueAt,
				status: "open",
				lastActivityAt: now,
				createdAt: now,
				updatedAt: now,
			});
			const globalSearchEntryId = await syncGlobalSearchEntry(ctx, undefined, {
				organizationId,
				target: { kind: "case", caseId },
				identifier: reference,
				label: details.title,
				descriptor: "Case",
			});
			await ctx.db.patch("cases", caseId, { globalSearchEntryId });

			await ctx.db.insert("caseCaseRelations", {
				...canonicalCasePair(anchorCase._id, caseId),
				startedAt: now,
				endedAt: null,
				addedByMemberId: null,
				removedByMemberId: null,
			});
			await ctx.scheduler.runAfter(0, internal.case.embedding.embedCase, {
				caseId,
			});
			await commitMutatingToolResult(ctx, item, caseId);
			return caseId;
		},
	});

	const updateCase = mutation({
		args: {
			...mutatingRuntimeArgs,
			caseId: v.id("cases"),
			title: v.optional(v.string()),
			description: v.optional(v.string()),
			dueAt: v.optional(v.union(v.number(), v.null())),
			status: v.optional(caseStatusValidator),
		},
		returns: v.id("cases"),
		handler: async (ctx, args) => {
			requireAgentRuntimeSecret(args.runtimeSecret);
			const { item, organizationId, task } = await requireMutatingToolLedger(
				ctx,
				args,
				"update_case",
			);
			const caseRecord = await requireCase(ctx, organizationId, args.caseId);
			await requireAgentTaskCaseWriteAccess(ctx, caseRecord._id, task._id);
			if (item.status === "completed") {
				return requirePersistedCaseUpdate(ctx, {
					outputJson: requireCompletedToolOutput(item),
					caseId: caseRecord._id,
				});
			}
			if (
				args.title === undefined &&
				args.description === undefined &&
				args.dueAt === undefined &&
				args.status === undefined
			) {
				throw invalidAgentTool("Choose at least one case change.");
			}
			const details = parseCaseDetails({
				title: args.title ?? caseRecord.title,
				description: args.description ?? caseRecord.description,
				dueAt: args.dueAt === undefined ? caseRecord.dueAt : args.dueAt,
				status: args.status ?? caseRecord.status,
			});
			const now = Date.now();
			const statusChanged = caseRecord.status !== details.status;
			const descriptionChanged = caseRecord.description !== details.description;
			const detailsChanged =
				caseRecord.title !== details.title || descriptionChanged;
			await ctx.db.patch("cases", caseRecord._id, {
				title: details.title,
				description: details.description,
				dueAt: details.dueAt,
				status: details.status,
				updatedAt: now,
				lastActivityAt:
					statusChanged || descriptionChanged ? now : caseRecord.lastActivityAt,
			});
			const globalSearchEntryId = await syncGlobalSearchEntry(
				ctx,
				caseRecord.globalSearchEntryId,
				{
					organizationId,
					target: { kind: "case", caseId: caseRecord._id },
					identifier: caseRecord.reference,
					label: details.title,
					descriptor: "Case",
				},
			);
			if (globalSearchEntryId !== caseRecord.globalSearchEntryId) {
				await ctx.db.patch("cases", caseRecord._id, { globalSearchEntryId });
			}
			if (statusChanged) {
				await dispatchDomainEvent(ctx, {
					name: "case.statusChanged",
					payload: {
						caseId: caseRecord._id,
						status: details.status,
						changedByMemberId: null,
						occurredAt: now,
					},
				});
			}
			if (detailsChanged) {
				await dispatchDomainEvent(ctx, {
					name: "case.detailsChanged",
					payload: {
						caseId: caseRecord._id,
						previous: {
							title: caseRecord.title,
							description: caseRecord.description,
						},
					},
				});
			}
			if (descriptionChanged) {
				await appendAgentChangeCaseEvent(
					ctx,
					caseRecord,
					"Agent updated the case description.",
					task._id,
					now,
				);
			}
			if (statusChanged) {
				await appendAgentChangeCaseEvent(
					ctx,
					caseRecord,
					`Agent changed the case status from ${CASE_STATUS_LABELS[caseRecord.status]} to ${CASE_STATUS_LABELS[details.status]}.`,
					task._id,
					now,
				);
			}
			await commitMutatingToolResult(ctx, item, caseRecord._id);
			return caseRecord._id;
		},
	});

	const addCaseRelation = mutation({
		args: {
			...mutatingRuntimeArgs,
			caseId: v.id("cases"),
			relation: caseRelationTargetValidator,
		},
		returns: caseRelationIdValidator,
		handler: async (ctx, args) => {
			requireAgentRuntimeSecret(args.runtimeSecret);
			const { item, organizationId, task } = await requireMutatingToolLedger(
				ctx,
				args,
				"add_case_relation",
			);
			const caseRecord = await requireCase(ctx, organizationId, args.caseId);
			await requireAgentTaskCaseWriteAccess(ctx, caseRecord._id, task._id);
			if (item.status === "completed") {
				return await requirePersistedCaseRelation(ctx, {
					outputJson: requireCompletedToolOutput(item),
					caseId: caseRecord._id,
					relation: args.relation,
				});
			}

			const actor = { kind: "agent" as const, taskId: task._id };
			let relationId:
				| Id<"caseContactRelations">
				| Id<"caseEntityRelations">
				| Id<"caseCaseRelations">
				| Id<"caseEmailThreadRelations">;
			switch (args.relation.kind) {
				case "contact":
					relationId = await addContactCaseRelation(
						ctx,
						organizationId,
						caseRecord,
						args.relation.contactId,
						actor,
					);
					break;
				case "entity":
					relationId = await addEntityCaseRelation(
						ctx,
						organizationId,
						caseRecord,
						args.relation.entityId,
						actor,
					);
					break;
				case "case":
					await requireCase(ctx, organizationId, args.relation.relatedCaseId);
					await requireHumanCaseWriteAccess(ctx, args.relation.relatedCaseId);
					relationId = await addRelatedCaseRelation(
						ctx,
						organizationId,
						caseRecord,
						args.relation.relatedCaseId,
						actor,
					);
					break;
				case "email_thread": {
					const thread = await ctx.db.get(args.relation.threadId);
					if (!thread || thread.organizationId !== organizationId) {
						throw invalidAgentTool("The email thread could not be found.");
					}
					const activeRelation = await getActiveCaseRelationForEmailThread(
						ctx,
						args.relation.threadId,
					);
					if (activeRelation && activeRelation.caseId !== caseRecord._id) {
						throw invalidAgentTool(
							"The email thread is already linked to another case.",
						);
					}
					relationId = await linkEmailThreadToCase(
						ctx,
						organizationId,
						caseRecord,
						args.relation.threadId,
						actor,
					);
					break;
				}
			}
			await commitMutatingToolResult(ctx, item, relationId);
			return relationId;
		},
	});

	return { readCase, createCase, updateCase, addCaseRelation };
}
