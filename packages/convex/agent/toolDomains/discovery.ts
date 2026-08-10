import { v } from "convex/values";
import { requireAgentRuntimeSecret } from "#/agent/access";
import { requireRunOrganization } from "#/agent/toolLedger";
import {
	globalSearchResultValidator,
	inspectContactResultValidator,
	inspectEntityResultValidator,
	invalidPersistedAgentData,
	loadEntityFieldValue,
	summarizeText,
	validateEmailMessageLinks,
	validateGlobalSearchTarget,
} from "#/agent/toolReadModel";
import { MAX_FIELDS_PER_ENTITY_TYPE } from "#/entity/constants";
import { mutation } from "../../_generated/server";
import { runtimeArgs } from "./shared";

const MAX_GLOBAL_SEARCH_CANDIDATES = 60;
const MAX_GLOBAL_SEARCH_RESULTS = 20;
const MAX_RELATIONS_PER_KIND = 50;

export function createDiscoveryTools() {
	const search = mutation({
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
			const searchQuery = args.searchQuery.trim();
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

	const inspectEntity = mutation({
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

	const inspectContact = mutation({
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

	return { search, inspectEntity, inspectContact };
}
