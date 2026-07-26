import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { caseStatusValidator } from "./case/model";
import { emailParticipantValidator } from "./email/model";
import { entityFieldTypeValidator, entityIconValidator } from "./entity/model";

export default defineSchema({
	organizations: defineTable({
		name: v.string(),
		slug: v.string(),
		workosOrganizationId: v.optional(v.string()),
	})
		.index("by_slug", ["slug"])
		.index("by_workos_organization_id", ["workosOrganizationId"]),

	emailConnections: defineTable({
		organizationId: v.id("organizations"),
		provider: v.string(),
		displayName: v.string(),
		address: v.string(),
		status: v.union(v.literal("active"), v.literal("disabled")),
	})
		.index("by_organization_id", ["organizationId"])
		.index("by_address", ["address"]),

	emailThreads: defineTable({
		connectionId: v.id("emailConnections"),
		externalThreadId: v.optional(v.string()),
		latestMessageId: v.optional(v.id("emailMessages")),
		lastActivityAt: v.number(),
	})
		.index("by_connection_id_and_external_thread_id", [
			"connectionId",
			"externalThreadId",
		])
		.index("by_connection_id_and_last_activity_at", [
			"connectionId",
			"lastActivityAt",
		]),

	contacts: defineTable({
		organizationId: v.id("organizations"),
		address: v.string(),
		name: v.optional(v.string()),
		firstSeenAt: v.number(),
		lastSeenAt: v.number(),
	})
		.index("by_organization_id_and_address", ["organizationId", "address"])
		.index("by_organization_id_and_last_seen_at", [
			"organizationId",
			"lastSeenAt",
		]),

	organizationMembers: defineTable({
		organizationId: v.id("organizations"),
		name: v.string(),
		email: v.string(),
		tokenIdentifier: v.optional(v.string()),
		status: v.union(v.literal("active"), v.literal("disabled")),
	})
		.index("by_organization_id_and_email", ["organizationId", "email"])
		.index("by_organization_id_and_token_identifier", [
			"organizationId",
			"tokenIdentifier",
		])
		.index("by_organization_id_and_status_and_name", [
			"organizationId",
			"status",
			"name",
		])
		.index("by_organization_id_and_name", ["organizationId", "name"]),

	entityTypes: defineTable({
		organizationId: v.id("organizations"),
		key: v.string(),
		name: v.string(),
		pluralName: v.string(),
		identifierLabel: v.string(),
		description: v.string(),
		icon: entityIconValidator,
		archivedAt: v.union(v.number(), v.null()),
	})
		.index("by_organization_id_and_key", ["organizationId", "key"])
		.index("by_organization_id_and_name", ["organizationId", "name"])
		.index("by_organization_id_and_archived_at_and_name", [
			"organizationId",
			"archivedAt",
			"name",
		]),

	entityFieldDefinitions: defineTable({
		entityTypeId: v.id("entityTypes"),
		key: v.string(),
		label: v.string(),
		valueType: entityFieldTypeValidator,
		required: v.boolean(),
		position: v.number(),
		archivedAt: v.union(v.number(), v.null()),
	})
		.index("by_entity_type_id_and_key", ["entityTypeId", "key"])
		.index("by_entity_type_id_and_position", ["entityTypeId", "position"])
		.index("by_entity_type_id_and_archived_at_and_position", [
			"entityTypeId",
			"archivedAt",
			"position",
		]),

	entities: defineTable({
		entityTypeId: v.id("entityTypes"),
		identifier: v.string(),
		normalizedIdentifier: v.string(),
		displayName: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
		archivedAt: v.union(v.number(), v.null()),
	})
		.index("by_entity_type_id_and_normalized_identifier", [
			"entityTypeId",
			"normalizedIdentifier",
		])
		.index("by_entity_type_id_and_display_name", [
			"entityTypeId",
			"displayName",
		])
		.index("by_entity_type_id_and_archived_at_and_display_name", [
			"entityTypeId",
			"archivedAt",
			"displayName",
		]),

	entityTextFieldValues: defineTable({
		entityId: v.id("entities"),
		fieldDefinitionId: v.id("entityFieldDefinitions"),
		value: v.string(),
	})
		.index("by_entity_id_and_field_definition_id", [
			"entityId",
			"fieldDefinitionId",
		])
		.index("by_field_definition_id_and_value", ["fieldDefinitionId", "value"]),

	entityNumberFieldValues: defineTable({
		entityId: v.id("entities"),
		fieldDefinitionId: v.id("entityFieldDefinitions"),
		value: v.number(),
	})
		.index("by_entity_id_and_field_definition_id", [
			"entityId",
			"fieldDefinitionId",
		])
		.index("by_field_definition_id_and_value", ["fieldDefinitionId", "value"]),

	entityBooleanFieldValues: defineTable({
		entityId: v.id("entities"),
		fieldDefinitionId: v.id("entityFieldDefinitions"),
		value: v.boolean(),
	})
		.index("by_entity_id_and_field_definition_id", [
			"entityId",
			"fieldDefinitionId",
		])
		.index("by_field_definition_id_and_value", ["fieldDefinitionId", "value"]),

	entityDateFieldValues: defineTable({
		entityId: v.id("entities"),
		fieldDefinitionId: v.id("entityFieldDefinitions"),
		value: v.number(),
	})
		.index("by_entity_id_and_field_definition_id", [
			"entityId",
			"fieldDefinitionId",
		])
		.index("by_field_definition_id_and_value", ["fieldDefinitionId", "value"]),

	cases: defineTable({
		organizationId: v.id("organizations"),
		reference: v.string(),
		title: v.string(),
		description: v.string(),
		ownerMemberId: v.union(v.id("organizationMembers"), v.null()),
		dueAt: v.union(v.number(), v.null()),
		status: caseStatusValidator,
		lastActivityAt: v.number(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_organization_id_and_reference", ["organizationId", "reference"])
		.index("by_organization_id_and_last_activity_at", [
			"organizationId",
			"lastActivityAt",
		]),

	caseEvents: defineTable({
		caseId: v.id("cases"),
		body: v.string(),
		occurredAt: v.number(),
		createdAt: v.number(),
		createdByMemberId: v.union(v.id("organizationMembers"), v.null()),
	}).index("by_case_id_and_occurred_at", ["caseId", "occurredAt"]),

	caseContactRelations: defineTable({
		caseId: v.id("cases"),
		contactId: v.id("contacts"),
		startedAt: v.number(),
		endedAt: v.union(v.number(), v.null()),
		addedByMemberId: v.union(v.id("organizationMembers"), v.null()),
		removedByMemberId: v.union(v.id("organizationMembers"), v.null()),
	})
		.index("by_case_id_and_ended_at", ["caseId", "endedAt"])
		.index("by_case_id_and_contact_id_and_ended_at", [
			"caseId",
			"contactId",
			"endedAt",
		])
		.index("by_contact_id_and_ended_at", ["contactId", "endedAt"]),

	caseEntityRelations: defineTable({
		caseId: v.id("cases"),
		entityId: v.id("entities"),
		startedAt: v.number(),
		endedAt: v.union(v.number(), v.null()),
		addedByMemberId: v.union(v.id("organizationMembers"), v.null()),
		removedByMemberId: v.union(v.id("organizationMembers"), v.null()),
	})
		.index("by_case_id_and_ended_at", ["caseId", "endedAt"])
		.index("by_case_id_and_entity_id_and_ended_at", [
			"caseId",
			"entityId",
			"endedAt",
		])
		.index("by_entity_id_and_ended_at", ["entityId", "endedAt"]),

	emailMessages: defineTable({
		connectionId: v.id("emailConnections"),
		threadId: v.id("emailThreads"),
		senderContactId: v.id("contacts"),
		externalMessageId: v.string(),
		internetMessageId: v.optional(v.string()),
		inReplyTo: v.optional(v.string()),
		references: v.array(v.string()),
		direction: v.literal("inbound"),
		from: emailParticipantValidator,
		to: v.array(emailParticipantValidator),
		cc: v.array(emailParticipantValidator),
		bcc: v.array(emailParticipantValidator),
		replyTo: v.array(emailParticipantValidator),
		subject: v.string(),
		textBody: v.string(),
		sentAt: v.number(),
		receivedAt: v.number(),
	})
		.index("by_thread_id_and_received_at", ["threadId", "receivedAt"])
		.index("by_sender_contact_id_and_received_at", [
			"senderContactId",
			"receivedAt",
		])
		.index("by_connection_id_and_external_message_id", [
			"connectionId",
			"externalMessageId",
		])
		.index("by_connection_id_and_internet_message_id", [
			"connectionId",
			"internetMessageId",
		]),

	emailIngestEvents: defineTable({
		connectionId: v.optional(v.id("emailConnections")),
		externalEventId: v.string(),
		externalMessageId: v.string(),
		eventType: v.string(),
		status: v.union(
			v.literal("pending"),
			v.literal("processed"),
			v.literal("failed"),
			v.literal("ignored"),
		),
		rawPayload: v.string(),
		receivedAt: v.number(),
		processedAt: v.optional(v.number()),
		error: v.optional(v.string()),
		attempts: v.number(),
	})
		.index("by_external_event_id", ["externalEventId"])
		.index("by_connection_id_and_external_message_id", [
			"connectionId",
			"externalMessageId",
		]),
});
