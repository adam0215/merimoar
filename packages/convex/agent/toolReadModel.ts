import { v } from "convex/values";
import { caseStatusValidator } from "#/case/model";
import { emailParticipantValidator } from "#/email/model";
import { entityFieldTypeValidator } from "#/entity/model";
import { globalSearchTargetValidator } from "#/globalSearch/model";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const globalSearchResultValidator = v.object({
	target: globalSearchTargetValidator,
	identifier: v.string(),
	label: v.string(),
	descriptor: v.string(),
});

export const inspectEntityResultValidator = v.union(
	v.object({
		entity: v.object({
			id: v.id("entities"),
			identifier: v.string(),
			displayName: v.string(),
		}),
		definition: v.object({
			id: v.id("entityTypes"),
			key: v.string(),
			name: v.string(),
			description: v.string(),
		}),
		fields: v.array(
			v.object({
				id: v.id("entityFieldDefinitions"),
				label: v.string(),
				valueType: entityFieldTypeValidator,
				required: v.boolean(),
				value: v.union(v.string(), v.number(), v.boolean(), v.null()),
			}),
		),
	}),
	v.null(),
);

export const inspectContactResultValidator = v.union(
	v.object({
		contact: v.object({
			id: v.id("contacts"),
			address: v.string(),
			name: v.optional(v.string()),
		}),
		recentMessages: v.array(
			v.object({
				messageId: v.id("emailMessages"),
				threadId: v.id("emailThreads"),
				subject: v.string(),
				receivedAt: v.number(),
				summary: v.string(),
			}),
		),
		cases: v.array(
			v.object({
				id: v.id("cases"),
				reference: v.string(),
				title: v.string(),
				status: caseStatusValidator,
			}),
		),
	}),
	v.null(),
);

const caseEventSummaryValidator = v.union(
	v.object({
		kind: v.union(
			v.literal("human_note"),
			v.literal("system_change"),
			v.literal("agent_note"),
			v.literal("agent_change"),
		),
		body: v.string(),
		occurredAt: v.number(),
	}),
	v.object({
		kind: v.union(v.literal("inbound_email"), v.literal("outbound_email")),
		emailMessageId: v.id("emailMessages"),
		occurredAt: v.number(),
	}),
);

export const readCaseResultValidator = v.union(
	v.object({
		case: v.object({
			id: v.id("cases"),
			reference: v.string(),
			title: v.string(),
			description: v.string(),
			dueAt: v.union(v.number(), v.null()),
			status: caseStatusValidator,
		}),
		events: v.array(caseEventSummaryValidator),
		contactIds: v.array(v.id("contacts")),
		entityIds: v.array(v.id("entities")),
		relatedCaseIds: v.array(v.id("cases")),
		emailThreadIds: v.array(v.id("emailThreads")),
	}),
	v.null(),
);

export const emailSearchResultValidator = v.object({
	threadId: v.id("emailThreads"),
	lastActivityAt: v.number(),
	subject: v.string(),
	from: emailParticipantValidator,
	summary: v.string(),
});

export const readEmailThreadResultValidator = v.union(
	v.object({
		thread: v.object({
			id: v.id("emailThreads"),
			lastActivityAt: v.number(),
			inbox: v.object({
				displayName: v.string(),
				address: v.string(),
			}),
		}),
		messages: v.array(
			v.object({
				id: v.id("emailMessages"),
				direction: v.union(v.literal("inbound"), v.literal("outbound")),
				from: emailParticipantValidator,
				to: v.array(emailParticipantValidator),
				cc: v.array(emailParticipantValidator),
				subject: v.string(),
				textBody: v.string(),
				sentAt: v.number(),
			}),
		),
	}),
	v.null(),
);

export function invalidPersistedAgentData(message: string): never {
	throw new Error(`Invalid persisted agent data: ${message}`);
}

export async function loadEntityFieldValue(
	ctx: MutationCtx,
	valueType: Doc<"entityFieldDefinitions">["valueType"],
	entityId: Id<"entities">,
	fieldDefinitionId: Id<"entityFieldDefinitions">,
) {
	switch (valueType) {
		case "text":
			return await ctx.db
				.query("entityTextFieldValues")
				.withIndex("by_entity_id_and_field_definition_id", (index) =>
					index
						.eq("entityId", entityId)
						.eq("fieldDefinitionId", fieldDefinitionId),
				)
				.unique();
		case "number":
			return await ctx.db
				.query("entityNumberFieldValues")
				.withIndex("by_entity_id_and_field_definition_id", (index) =>
					index
						.eq("entityId", entityId)
						.eq("fieldDefinitionId", fieldDefinitionId),
				)
				.unique();
		case "boolean":
			return await ctx.db
				.query("entityBooleanFieldValues")
				.withIndex("by_entity_id_and_field_definition_id", (index) =>
					index
						.eq("entityId", entityId)
						.eq("fieldDefinitionId", fieldDefinitionId),
				)
				.unique();
		case "date":
			return await ctx.db
				.query("entityDateFieldValues")
				.withIndex("by_entity_id_and_field_definition_id", (index) =>
					index
						.eq("entityId", entityId)
						.eq("fieldDefinitionId", fieldDefinitionId),
				)
				.unique();
	}
}

export function summarizeText(value: string) {
	const normalized = value.replace(/\s+/g, " ").trim();
	return normalized.length > 400
		? `${normalized.slice(0, 397).trimEnd()}...`
		: normalized;
}

export async function validateGlobalSearchTarget(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	target: Doc<"globalSearchEntries">["target"],
) {
	switch (target.kind) {
		case "contact": {
			const contact = await ctx.db.get(target.contactId);
			if (!contact || contact.organizationId !== organizationId) {
				invalidPersistedAgentData(
					"global search contact belongs to another organization",
				);
			}
			return;
		}
		case "case": {
			const caseRecord = await ctx.db.get(target.caseId);
			if (!caseRecord || caseRecord.organizationId !== organizationId) {
				invalidPersistedAgentData(
					"global search case belongs to another organization",
				);
			}
			return;
		}
		case "entity": {
			const [entity, entityType] = await Promise.all([
				ctx.db.get(target.entityId),
				ctx.db.get(target.entityTypeId),
			]);
			if (
				!entity ||
				entity.entityTypeId !== target.entityTypeId ||
				entity.archivedAt !== null ||
				!entityType ||
				entityType.organizationId !== organizationId ||
				entityType.archivedAt !== null
			) {
				invalidPersistedAgentData(
					"global search entity belongs to another organization or type",
				);
			}
		}
	}
}

export async function validateEmailMessageLinks(
	ctx: MutationCtx,
	args: {
		message: Doc<"emailMessages">;
		thread: Doc<"emailThreads">;
		organizationId: Id<"organizations">;
	},
) {
	if (
		args.message.threadId !== args.thread._id ||
		args.message.inboxId !== args.thread.inboxId
	) {
		invalidPersistedAgentData("email message is cross-linked to its thread");
	}
	const [inbox, integration] = await Promise.all([
		ctx.db.get(args.thread.inboxId),
		ctx.db.get(args.message.integrationId),
	]);
	if (!inbox || inbox.organizationId !== args.organizationId) {
		invalidPersistedAgentData(
			"email message inbox belongs to another organization",
		);
	}
	if (!integration || integration.organizationId !== args.organizationId) {
		invalidPersistedAgentData(
			"email message integration belongs to another organization",
		);
	}
	if (args.message.direction === "inbound") {
		const sender = await ctx.db.get(args.message.senderContactId);
		if (!sender || sender.organizationId !== args.organizationId) {
			invalidPersistedAgentData("email sender belongs to another organization");
		}
		return;
	}
	const author = await ctx.db.get(args.message.authoredByMemberId);
	if (!author || author.organizationId !== args.organizationId) {
		invalidPersistedAgentData("email author belongs to another organization");
	}
}
