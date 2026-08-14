import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
	customToolParameterValidator,
	customToolRunSnapshotValidator,
} from "#/agent/customToolModel";
import {
	agentItemValidator,
	agentRunValidator,
	agentTaskValidator,
	agentTurnValidator,
} from "#/agent/model";
import { CASE_EMBEDDING_DIMENSIONS } from "#/case/embeddingModel";
import { caseEventValidator, caseStatusValidator } from "#/case/model";
import {
	emailIngestFailureKindValidator,
	emailIngestStatusValidator,
	emailMessageValidator,
	emailSendValidator,
} from "#/email/model";
import { entityFieldTypeValidator, entityIconValidator } from "#/entity/model";
import { globalSearchTargetValidator } from "#/globalSearch/model";
import {
	connectionStatusValidator,
	resendWebhookValidator,
} from "#/integrations/model";

export default defineSchema({
	organizations: defineTable({
		name: v.string(),
		workosOrganizationId: v.string(),
		referenceSlug: v.string(),
		active: v.boolean(),
	}).index("by_workos_organization_id", ["workosOrganizationId"]),

	connectedAccounts: defineTable({
		organizationId: v.id("organizations"),
		providerSlug: v.string(),
		workosUserId: v.string(),
		workosDataIntegrationId: v.string(),
		workosConnectedAccountId: v.string(),
		connectionStatus: connectionStatusValidator,
		grantedScopes: v.array(v.string()),
		workosUpdatedAt: v.number(),
	})
		.index("by_workos_connected_account_id", ["workosConnectedAccountId"])
		.index("by_organization_id_and_provider_slug", [
			"organizationId",
			"providerSlug",
		])
		.index("by_organization_id_and_provider_slug_and_workos_user_id", [
			"organizationId",
			"providerSlug",
			"workosUserId",
		])
		.index("by_organization_id_and_workos_user_id_and_updated_at", [
			"organizationId",
			"workosUserId",
			"workosUpdatedAt",
		])
		.index("by_organization_id_provider_slug_workos_user_id_updated_at", [
			"organizationId",
			"providerSlug",
			"workosUserId",
			"workosUpdatedAt",
		]),

	customIntegrations: defineTable({
		organizationId: v.id("organizations"),
		name: v.string(),
		baseUrl: v.string(),
		updatedAt: v.number(),
	})
		.index("by_organization_id", ["organizationId"])
		.index("by_organization_id_and_name", ["organizationId", "name"]),

	agentCustomTools: defineTable({
		agentKey: v.string(),
		integrationId: v.id("customIntegrations"),
		name: v.string(),
		normalizedName: v.string(),
		description: v.string(),
		path: v.string(),
		parameters: v.array(customToolParameterValidator),
		requiresApproval: v.boolean(),
		testedConfigurationHash: v.string(),
		updatedAt: v.number(),
	}).index("by_integration_id", ["integrationId"]),

	organizationAgentBuiltInTools: defineTable({
		organizationId: v.id("organizations"),
		toolKey: v.string(),
		active: v.boolean(),
		updatedAt: v.number(),
		updatedByMemberId: v.id("organizationMembers"),
	}).index("by_organization_id_and_tool_key", ["organizationId", "toolKey"]),

	caseReferenceSequences: defineTable({
		organizationId: v.id("organizations"),
		lastIndex: v.int64(),
	}).index("by_organization_id", ["organizationId"]),

	emailIntegrations: defineTable({
		connectedAccountId: v.id("connectedAccounts"),
		resendWebhook: v.optional(resendWebhookValidator),
	}).index("by_connected_account_id", ["connectedAccountId"]),

	emailIntegrationWebhookCleanupTasks: defineTable({
		integrationId: v.id("emailIntegrations"),
		webhookId: v.string(),
		workosOrganizationId: v.string(),
		workosUserId: v.string(),
		attempts: v.number(),
		nextAttemptAt: v.number(),
		completedAt: v.optional(v.number()),
	})
		.index("by_integration_id_and_webhook_id", ["integrationId", "webhookId"])
		.index("by_completed_at_and_next_attempt_at", [
			"completedAt",
			"nextAttemptAt",
		]),

	emailInboxes: defineTable({
		organizationId: v.id("organizations"),
		displayName: v.string(),
		address: v.string(),
		status: v.union(v.literal("active"), v.literal("disabled")),
		unreadThreadCount: v.number(),
		outbound: v.optional(
			v.object({
				integrationId: v.id("emailIntegrations"),
				address: v.string(),
			}),
		),
	})
		.index("by_organization_id", ["organizationId"])
		.index("by_organization_id_and_address", ["organizationId", "address"])
		.index("by_organization_id_and_status", ["organizationId", "status"]),

	emailIntegrationSyncEvents: defineTable({
		source: v.literal("workos_pipes"),
		sourceEventId: v.string(),
		eventType: v.union(
			v.literal("pipes.connected_account.connected"),
			v.literal("pipes.connected_account.disconnected"),
			v.literal("pipes.connected_account.reauthorization_needed"),
		),
		processedAt: v.number(),
	}).index("by_source_and_source_event_id", ["source", "sourceEventId"]),

	connectedAccountSyncEvents: defineTable({
		source: v.literal("workos_pipes"),
		sourceEventId: v.string(),
		eventType: v.union(
			v.literal("pipes.connected_account.connected"),
			v.literal("pipes.connected_account.disconnected"),
			v.literal("pipes.connected_account.reauthorization_needed"),
		),
		providerSlug: v.optional(v.string()),
		workosConnectedAccountId: v.optional(v.string()),
		connectedAccountId: v.optional(v.id("connectedAccounts")),
		workosUpdatedAt: v.optional(v.number()),
		outcome: v.union(
			v.literal("inserted"),
			v.literal("updated"),
			v.literal("stale"),
			v.literal("unchanged"),
			v.literal("ignored_unscoped"),
			v.literal("legacy_backfill"),
		),
		processedAt: v.number(),
	}).index("by_source_and_source_event_id", ["source", "sourceEventId"]),

	emailThreads: defineTable({
		organizationId: v.id("organizations"),
		inboxId: v.id("emailInboxes"),
		latestMessageId: v.optional(v.id("emailMessages")),
		lastActivityAt: v.number(),
		isUnread: v.optional(v.boolean()),
		archivedAt: v.optional(v.number()),
	})
		.index("by_organization_id_and_last_activity_at", [
			"organizationId",
			"lastActivityAt",
		])
		.index("by_org_archive_activity", [
			"organizationId",
			"archivedAt",
			"lastActivityAt",
		])
		.index("by_org_inbox_archive_activity", [
			"organizationId",
			"inboxId",
			"archivedAt",
			"lastActivityAt",
		])
		.index("by_inbox_id_and_is_unread", ["inboxId", "isUnread"]),

	emailThreadExternalReferences: defineTable({
		threadId: v.id("emailThreads"),
		inboxId: v.id("emailInboxes"),
		integrationId: v.id("emailIntegrations"),
		externalThreadId: v.string(),
	})
		.index("by_thread_id", ["threadId"])
		.index("by_inbox_id_and_integration_id_and_external_thread_id", [
			"inboxId",
			"integrationId",
			"externalThreadId",
		]),

	contacts: defineTable({
		organizationId: v.id("organizations"),
		address: v.string(),
		name: v.optional(v.string()),
		firstSeenAt: v.number(),
		lastSeenAt: v.number(),
		globalSearchEntryId: v.optional(v.id("globalSearchEntries")),
	})
		.index("by_organization_id_and_address", ["organizationId", "address"])
		.index("by_organization_id_and_last_seen_at", [
			"organizationId",
			"lastSeenAt",
		]),

	organizationMembers: defineTable({
		organizationId: v.id("organizations"),
		workosUserId: v.string(),
		active: v.boolean(),
	})
		.index("by_organization_id_and_workos_user_id", [
			"organizationId",
			"workosUserId",
		])
		.index("by_organization_id_and_active", ["organizationId", "active"]),

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
		label: v.string(),
		valueType: entityFieldTypeValidator,
		required: v.boolean(),
		position: v.number(),
		archivedAt: v.union(v.number(), v.null()),
	})
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
		globalSearchEntryId: v.optional(v.id("globalSearchEntries")),
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
		])
		.index("by_entity_type_id_and_archived_at_and_updated_at", [
			"entityTypeId",
			"archivedAt",
			"updatedAt",
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
		globalSearchEntryId: v.optional(v.id("globalSearchEntries")),
	})
		.index("by_organization_id_and_reference", ["organizationId", "reference"])
		.index("by_organization_id_and_status_and_last_activity_at", [
			"organizationId",
			"status",
			"lastActivityAt",
		])
		.index("by_organization_id_and_owner_member_id_and_last_activity_at", [
			"organizationId",
			"ownerMemberId",
			"lastActivityAt",
		])
		.index("by_organization_id_and_due_at", ["organizationId", "dueAt"])
		.index("by_organization_id_and_last_activity_at", [
			"organizationId",
			"lastActivityAt",
		]),

	agentTasks: defineTable(agentTaskValidator)
		.index("by_organization_id_and_requested_at", [
			"organizationId",
			"requestedAt",
		])
		.index("by_organization_id_and_status_and_requested_at", [
			"organizationId",
			"status",
			"requestedAt",
		])
		.index("by_anchor_case_id_and_ownership_released_at", [
			"anchorCaseId",
			"ownershipReleasedAt",
		])
		.index("by_anchor_case_id_and_requested_at", [
			"anchorCaseId",
			"requestedAt",
		])
		.index("by_organization_id_and_requested_by_member_id_and_requested_at", [
			"organizationId",
			"requestedByMemberId",
			"requestedAt",
		]),

	agentTurns: defineTable(agentTurnValidator).index("by_task_id_and_sequence", [
		"taskId",
		"sequence",
	]),

	agentRuns: defineTable(agentRunValidator)
		.index("by_turn_id_and_requested_at", ["turnId", "requestedAt"])
		.index("by_status_and_requested_at", ["status", "requestedAt"]),

	// Approval continuation must replay the exact executable definition that was
	// approved, even if the workspace tool changes before the run resumes.
	agentRunCustomToolDefinitions: defineTable(
		customToolRunSnapshotValidator.extend({
			runId: v.id("agentRuns"),
		}),
	).index("by_run_id", ["runId"]),

	agentItems: defineTable(agentItemValidator)
		.index("by_turn_id_and_sequence", ["turnId", "sequence"])
		.index("by_run_id_and_tool_call_id", ["runId", "toolCallId"])
		.index("by_run_id_and_kind_and_sequence", ["runId", "kind", "sequence"])
		.index("by_approval_id", ["approvalId"]),

	caseEmbeddings: defineTable({
		caseId: v.id("cases"),
		organizationId: v.id("organizations"),
		embedding: v.array(v.float64()),
	})
		.index("by_case_id", ["caseId"])
		.vectorIndex("by_embedding", {
			vectorField: "embedding",
			dimensions: CASE_EMBEDDING_DIMENSIONS,
			filterFields: ["organizationId"],
		}),

	globalSearchEntries: defineTable({
		organizationId: v.id("organizations"),
		target: globalSearchTargetValidator,
		identifier: v.string(),
		label: v.string(),
		descriptor: v.string(),
		searchText: v.string(),
	}).searchIndex("search_search_text_and_organization_id", {
		searchField: "searchText",
		filterFields: ["organizationId"],
	}),

	caseEvents: defineTable(caseEventValidator)
		.index("by_case_id_and_occurred_at", ["caseId", "occurredAt"])
		.index("by_case_id_and_email_message_id", ["caseId", "emailMessageId"])
		.index("by_type", ["type"]),

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

	caseCaseRelations: defineTable({
		caseId: v.id("cases"),
		relatedCaseId: v.id("cases"),
		startedAt: v.number(),
		endedAt: v.union(v.number(), v.null()),
		addedByMemberId: v.union(v.id("organizationMembers"), v.null()),
		removedByMemberId: v.union(v.id("organizationMembers"), v.null()),
	})
		.index("by_case_id_and_ended_at", ["caseId", "endedAt"])
		.index("by_related_case_id_and_ended_at", ["relatedCaseId", "endedAt"])
		.index("by_case_id_and_related_case_id_and_ended_at", [
			"caseId",
			"relatedCaseId",
			"endedAt",
		]),

	caseEmailThreadRelations: defineTable({
		caseId: v.id("cases"),
		threadId: v.id("emailThreads"),
		startedAt: v.number(),
		endedAt: v.union(v.number(), v.null()),
		linkedByMemberId: v.union(v.id("organizationMembers"), v.null()),
		unlinkedByMemberId: v.union(v.id("organizationMembers"), v.null()),
	})
		.index("by_case_id_and_ended_at", ["caseId", "endedAt"])
		.index("by_thread_id_and_ended_at", ["threadId", "endedAt"])
		.index("by_case_id_and_thread_id_and_ended_at", [
			"caseId",
			"threadId",
			"endedAt",
		]),

	// For outbound messages, sentAt is when Merimoar queued the immutable
	// message, not when a provider accepted or delivered it.
	emailMessages: defineTable(emailMessageValidator)
		.index("by_thread_id_and_sent_at", ["threadId", "sentAt"])
		.index("by_thread_id_and_direction_and_sent_at", [
			"threadId",
			"direction",
			"sentAt",
		])
		.index("by_thread_id_and_received_at", ["threadId", "receivedAt"])
		.index("by_sender_contact_id_and_received_at", [
			"senderContactId",
			"receivedAt",
		])
		.index("by_inbox_id_and_integration_id_and_external_message_id", [
			"inboxId",
			"integrationId",
			"externalMessageId",
		])
		.index("by_inbox_id_and_internet_message_id", [
			"inboxId",
			"internetMessageId",
		]),

	emailDrafts: defineTable({
		threadId: v.id("emailThreads"),
		authorMemberId: v.id("organizationMembers"),
		body: v.string(),
		revision: v.number(),
		updatedAt: v.number(),
	}).index("by_thread_id_and_author_member_id", ["threadId", "authorMemberId"]),

	emailSends: defineTable(emailSendValidator)
		.index("by_message_id", ["messageId"])
		.index("by_requested_by_member_id_and_client_request_id", [
			"requestedByMemberId",
			"clientRequestId",
		]),

	emailIngestEvents: defineTable({
		inboxId: v.optional(v.id("emailInboxes")),
		integrationId: v.id("emailIntegrations"),
		externalEventId: v.string(),
		externalMessageId: v.string(),
		eventType: v.string(),
		status: emailIngestStatusValidator,
		rawPayload: v.string(),
		receivedAt: v.number(),
		processedAt: v.optional(v.number()),
		error: v.optional(v.string()),
		failureKind: v.optional(emailIngestFailureKindValidator),
		attempts: v.number(),
		replayCount: v.optional(v.number()),
		processingGeneration: v.optional(v.number()),
		workId: v.optional(v.string()),
	}).index("by_integration_id_and_external_event_id", [
		"integrationId",
		"externalEventId",
	]),

	emailIngestRecipients: defineTable({
		eventId: v.id("emailIngestEvents"),
		address: v.string(),
		status: emailIngestStatusValidator,
		receivedAt: v.number(),
	})
		.index("by_event_id_and_address", ["eventId", "address"])
		.index("by_address_and_status_and_received_at", [
			"address",
			"status",
			"receivedAt",
		]),
});
