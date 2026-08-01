import { ConvexError, v } from "convex/values";
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
	emailSearchResultValidator,
	globalSearchResultValidator,
	inspectContactResultValidator,
	inspectEntityResultValidator,
	invalidPersistedAgentData,
	loadEntityFieldValue,
	readCaseResultValidator,
	readEmailThreadResultValidator,
	summarizeText,
	validateEmailMessageLinks,
	validateGlobalSearchTarget,
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
import {
	addContactCaseRelation,
	addEntityCaseRelation,
	addRelatedCaseRelation,
	canonicalCasePair,
	listActiveCaseRelations,
	requireCaseCanAddRelatedCase,
} from "#/case/relations";
import { dispatchDomainEvent } from "#/domainEvents";
import { MAX_FIELDS_PER_ENTITY_TYPE } from "#/entity/constants";
import { syncGlobalSearchEntry } from "#/globalSearch/model";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { mutation } from "../_generated/server";

const MAX_GLOBAL_SEARCH_CANDIDATES = 60;
const MAX_GLOBAL_SEARCH_RESULTS = 20;
const MAX_GLOBAL_SEARCH_QUERY_LENGTH = 100;
const MAX_CASE_EVENTS = 100;
const MAX_RELATIONS_PER_KIND = 50;
const MAX_EMAIL_SEARCH_THREADS = 50;
const MAX_EMAIL_SEARCH_RESULTS = 20;
const MAX_EMAIL_SEARCH_MESSAGES_PER_THREAD = 20;
const MAX_EMAIL_MESSAGES_PER_THREAD = 100;

const runtimeArgs = {
	runtimeSecret: v.string(),
	runId: v.id("agentRuns"),
	claimToken: v.string(),
};
const mutatingRuntimeArgs = {
	...runtimeArgs,
	toolCallId: v.string(),
};
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

function invalidAgentTool(message: string) {
	return new ConvexError({ code: "INVALID_AGENT_TOOL_INPUT", message });
}

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

export const search = mutation({
	args: {
		...runtimeArgs,
		searchQuery: v.string(),
		filter: v.union(
			v.object({ kind: v.literal("all") }),
			v.object({ kind: v.literal("cases") }),
			v.object({ kind: v.literal("entities") }),
			v.object({
				kind: v.literal("entity_type"),
				entityTypeKey: v.string(),
			}),
		),
	},
	returns: v.array(globalSearchResultValidator),
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		const { organizationId } = await requireRunOrganization(ctx, args);
		const searchQuery = args.searchQuery
			.trim()
			.slice(0, MAX_GLOBAL_SEARCH_QUERY_LENGTH);
		if (!searchQuery) return [];

		const entries = await ctx.db
			.query("globalSearchEntries")
			.withSearchIndex("search_search_text_and_organization_id", (index) =>
				index
					.search("searchText", searchQuery)
					.eq("organizationId", organizationId),
			)
			.take(MAX_GLOBAL_SEARCH_CANDIDATES);

		const filtered = [];
		for (const entry of entries) {
			if (args.filter.kind === "cases" && entry.target.kind !== "case") {
				continue;
			}
			if (
				(args.filter.kind === "entities" ||
					args.filter.kind === "entity_type") &&
				entry.target.kind !== "entity"
			) {
				continue;
			}
			if (
				args.filter.kind === "entity_type" &&
				entry.target.kind === "entity"
			) {
				const entityType = await ctx.db.get(entry.target.entityTypeId);
				if (
					!entityType ||
					entityType.organizationId !== organizationId ||
					entityType.key !== args.filter.entityTypeKey
				) {
					continue;
				}
			}
			await validateGlobalSearchTarget(ctx, organizationId, entry.target);
			filtered.push({
				target: entry.target,
				identifier: entry.identifier,
				label: entry.label,
				descriptor: entry.descriptor,
			});
			if (filtered.length >= MAX_GLOBAL_SEARCH_RESULTS) break;
		}
		return filtered;
	},
});

export const inspectEntity = mutation({
	args: {
		...runtimeArgs,
		entityId: v.id("entities"),
	},
	returns: inspectEntityResultValidator,
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		const { organizationId } = await requireRunOrganization(ctx, args);
		const entity = await ctx.db.get(args.entityId);
		if (!entity || entity.archivedAt !== null) return null;
		const entityType = await ctx.db.get(entity.entityTypeId);
		if (
			!entityType ||
			entityType.organizationId !== organizationId ||
			entityType.archivedAt !== null
		) {
			return null;
		}

		const fieldDefinitions = await ctx.db
			.query("entityFieldDefinitions")
			.withIndex("by_entity_type_id_and_archived_at_and_position", (index) =>
				index.eq("entityTypeId", entityType._id).eq("archivedAt", null),
			)
			.take(MAX_FIELDS_PER_ENTITY_TYPE + 1);
		if (fieldDefinitions.length > MAX_FIELDS_PER_ENTITY_TYPE) {
			invalidPersistedAgentData("entity type has too many active fields");
		}
		const fields = await Promise.all(
			fieldDefinitions.map(async (field) => {
				const value = await loadEntityFieldValue(
					ctx,
					field.valueType,
					entity._id,
					field._id,
				);
				return {
					id: field._id,
					label: field.label,
					valueType: field.valueType,
					required: field.required,
					value: value?.value ?? null,
				};
			}),
		);
		return {
			entity: {
				id: entity._id,
				identifier: entity.identifier,
				displayName: entity.displayName,
			},
			definition: {
				id: entityType._id,
				key: entityType.key,
				name: entityType.name,
				description: entityType.description,
			},
			fields,
		};
	},
});

export const inspectContact = mutation({
	args: {
		...runtimeArgs,
		contactId: v.id("contacts"),
	},
	returns: inspectContactResultValidator,
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		const { organizationId } = await requireRunOrganization(ctx, args);
		const contact = await ctx.db.get(args.contactId);
		if (!contact || contact.organizationId !== organizationId) return null;
		const [messages, relations] = await Promise.all([
			ctx.db
				.query("emailMessages")
				.withIndex("by_sender_contact_id_and_received_at", (index) =>
					index.eq("senderContactId", contact._id),
				)
				.order("desc")
				.take(20),
			ctx.db
				.query("caseContactRelations")
				.withIndex("by_contact_id_and_ended_at", (index) =>
					index.eq("contactId", contact._id).eq("endedAt", null),
				)
				.take(MAX_RELATIONS_PER_KIND),
		]);
		const recentMessages = [];
		for (const message of messages) {
			if (message.direction !== "inbound") continue;
			const thread = await ctx.db.get(message.threadId);
			if (!thread || thread.organizationId !== organizationId) {
				invalidPersistedAgentData(
					"contact email belongs to another organization",
				);
			}
			const inbox = await ctx.db.get(thread.inboxId);
			if (!inbox || inbox.organizationId !== organizationId) {
				invalidPersistedAgentData(
					"contact email inbox belongs to another organization",
				);
			}
			await validateEmailMessageLinks(ctx, {
				message,
				thread,
				organizationId,
			});
			recentMessages.push({
				messageId: message._id,
				threadId: message.threadId,
				subject: message.subject,
				receivedAt: message.receivedAt,
				summary: summarizeText(message.textBody),
			});
		}
		const relatedCases = await Promise.all(
			relations.map(async (relation) => {
				const caseRecord = await ctx.db.get(relation.caseId);
				if (!caseRecord || caseRecord.organizationId !== organizationId) {
					invalidPersistedAgentData(
						"contact case relation belongs to another organization",
					);
				}
				return {
					id: caseRecord._id,
					reference: caseRecord.reference,
					title: caseRecord.title,
					status: caseRecord.status,
				};
			}),
		);
		return {
			contact: {
				id: contact._id,
				address: contact.address,
				...(contact.name ? { name: contact.name } : {}),
			},
			recentMessages,
			cases: relatedCases,
		};
	},
});

export const readCase = mutation({
	args: {
		...runtimeArgs,
		caseId: v.id("cases"),
	},
	returns: readCaseResultValidator,
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		const { organizationId } = await requireRunOrganization(ctx, args);
		const caseRecord = await ctx.db.get(args.caseId);
		if (!caseRecord || caseRecord.organizationId !== organizationId)
			return null;
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
					if (!message || !thread || thread.organizationId !== organizationId) {
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

export const createCase = mutation({
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
		const reference = await generateCaseReference(ctx, organizationId);
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

export const updateCase = mutation({
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

export const addCaseRelation = mutation({
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

export const searchEmails = mutation({
	args: {
		...runtimeArgs,
		searchQuery: v.string(),
	},
	returns: v.array(emailSearchResultValidator),
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		const { organizationId } = await requireRunOrganization(ctx, args);
		const searchTerms = args.searchQuery
			.toLocaleLowerCase()
			.trim()
			.slice(0, MAX_GLOBAL_SEARCH_QUERY_LENGTH)
			.split(/\s+/)
			.filter(Boolean);
		const threads = await ctx.db
			.query("emailThreads")
			.withIndex("by_organization_id_and_last_activity_at", (index) =>
				index.eq("organizationId", organizationId),
			)
			.order("desc")
			.take(MAX_EMAIL_SEARCH_THREADS);
		const results = [];
		for (const thread of threads) {
			const inbox = await ctx.db.get(thread.inboxId);
			if (!inbox || inbox.organizationId !== organizationId) {
				invalidPersistedAgentData(
					"email search thread inbox belongs to another organization",
				);
			}
			const recentMessages = await ctx.db
				.query("emailMessages")
				.withIndex("by_thread_id_and_sent_at", (index) =>
					index.eq("threadId", thread._id),
				)
				.order("desc")
				.take(MAX_EMAIL_SEARCH_MESSAGES_PER_THREAD);
			const message = recentMessages.find((candidate) => {
				if (searchTerms.length === 0) return true;
				const haystack = [
					candidate.subject,
					candidate.textBody,
					candidate.from.name,
					candidate.from.address,
				]
					.filter(Boolean)
					.join(" ")
					.toLocaleLowerCase();
				return searchTerms.every((term) => haystack.includes(term));
			});
			if (!message) continue;
			await validateEmailMessageLinks(ctx, {
				message,
				thread,
				organizationId,
			});
			results.push({
				threadId: thread._id,
				lastActivityAt: thread.lastActivityAt,
				subject: message.subject,
				from: message.from,
				summary: summarizeText(message.textBody),
			});
			if (results.length >= MAX_EMAIL_SEARCH_RESULTS) break;
		}
		return results;
	},
});

export const readEmailThread = mutation({
	args: {
		...runtimeArgs,
		threadId: v.id("emailThreads"),
	},
	returns: readEmailThreadResultValidator,
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		const { organizationId } = await requireRunOrganization(ctx, args);
		const thread = await ctx.db.get(args.threadId);
		if (!thread || thread.organizationId !== organizationId) return null;
		const inbox = await ctx.db.get(thread.inboxId);
		if (!inbox || inbox.organizationId !== organizationId) return null;
		const messages = await ctx.db
			.query("emailMessages")
			.withIndex("by_thread_id_and_sent_at", (index) =>
				index.eq("threadId", thread._id),
			)
			.order("desc")
			.take(MAX_EMAIL_MESSAGES_PER_THREAD);
		await Promise.all(
			messages.map((message) =>
				validateEmailMessageLinks(ctx, {
					message,
					thread,
					organizationId,
				}),
			),
		);
		return {
			thread: {
				id: thread._id,
				lastActivityAt: thread.lastActivityAt,
				inbox: {
					displayName: inbox.displayName,
					address: inbox.address,
				},
			},
			messages: messages.reverse().map((message) => ({
				id: message._id,
				direction: message.direction,
				from: message.from,
				to: message.to,
				cc: message.cc,
				subject: message.subject,
				textBody: message.textBody,
				sentAt: message.sentAt,
			})),
		};
	},
});

async function generateCaseReference(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
) {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const reference = `CASE-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
		const existing = await ctx.db
			.query("cases")
			.withIndex("by_organization_id_and_reference", (index) =>
				index.eq("organizationId", organizationId).eq("reference", reference),
			)
			.unique();
		if (!existing) return reference;
	}
	throw new Error("Could not generate a unique case reference");
}
