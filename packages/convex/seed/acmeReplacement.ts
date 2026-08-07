import { v } from "convex/values";
import { insertAcmeDataset } from "#/seed/acme";
import {
	ACME_DATASET_VERSION,
	ACME_DEPLOYMENT_NAME,
	ACME_DEPLOYMENT_URL,
	ACME_REPLACEABLE_TABLES,
	ACME_WORKOS_ORGANIZATION_ID,
	type AcmeReplaceableTable,
	type AcmeReplacementCounts,
	calculateAcmeCreationCounts,
	calculateAcmeDatasetFingerprint,
	createEmptyAcmeReplacementCounts,
	hashAcmePayload,
} from "#/seed/acmeData";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internalMutation, internalQuery } from "../_generated/server";

const MAX_ROWS_PER_REPLACEMENT_TABLE = 2_000;
const MAX_SCANNED_ROWS_PER_TABLE = 4_000;
const REPLACEMENT_CONFIRMATION =
	"replace-acme-residential-management-v3-after-reviewed-preview" as const;

const countFields = Object.fromEntries(
	ACME_REPLACEABLE_TABLES.map((table) => [table, v.number()]),
) as Record<AcmeReplaceableTable, ReturnType<typeof v.number>>;
const replacementCountsValidator = v.object(countFields);

type DatabaseContext = Pick<QueryCtx | MutationCtx, "db">;

function requireBoundedRows<TableName extends AcmeReplaceableTable>(
	table: TableName,
	rows: readonly unknown[],
	limit = MAX_ROWS_PER_REPLACEMENT_TABLE,
) {
	if (rows.length > limit) {
		throw new Error(
			`Acme replacement aborted: ${table} exceeds the ${limit}-row safety limit`,
		);
	}
}

function uniqueDocuments<Document extends { _id: string }>(
	groups: readonly (readonly Document[])[],
) {
	return [...new Map(groups.flat().map((row) => [row._id, row])).values()];
}

async function collectAcmeOrganizationGraph(
	ctx: DatabaseContext,
	organizationId: Id<"organizations">,
) {
	const organization = await ctx.db.get(organizationId);
	if (!organization) {
		throw new Error("Acme replacement aborted: organization does not exist");
	}

	const [
		members,
		connectedAccounts,
		inboxes,
		threads,
		contacts,
		entityTypes,
		cases,
		globalSearchEntries,
		agentTasks,
	] = await Promise.all([
		ctx.db
			.query("organizationMembers")
			.withIndex("by_organization_id_and_workos_user_id", (index) =>
				index.eq("organizationId", organizationId),
			)
			.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
		ctx.db
			.query("connectedAccounts")
			.withIndex("by_organization_id_and_provider_slug", (index) =>
				index.eq("organizationId", organizationId),
			)
			.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
		ctx.db
			.query("emailInboxes")
			.withIndex("by_organization_id", (index) =>
				index.eq("organizationId", organizationId),
			)
			.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
		ctx.db
			.query("emailThreads")
			.withIndex("by_organization_id_and_last_activity_at", (index) =>
				index.eq("organizationId", organizationId),
			)
			.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
		ctx.db
			.query("contacts")
			.withIndex("by_organization_id_and_last_seen_at", (index) =>
				index.eq("organizationId", organizationId),
			)
			.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
		ctx.db
			.query("entityTypes")
			.withIndex("by_organization_id_and_archived_at_and_name", (index) =>
				index.eq("organizationId", organizationId),
			)
			.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
		ctx.db
			.query("cases")
			.withIndex("by_organization_id_and_last_activity_at", (index) =>
				index.eq("organizationId", organizationId),
			)
			.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
		ctx.db
			.query("globalSearchEntries")
			.filter((filter) =>
				filter.eq(filter.field("organizationId"), organizationId),
			)
			.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
		ctx.db
			.query("agentTasks")
			.withIndex("by_organization_id_and_requested_at", (index) =>
				index.eq("organizationId", organizationId),
			)
			.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
	]);
	const integrationGroups = await Promise.all(
		connectedAccounts.map((account) =>
			ctx.db
				.query("emailIntegrations")
				.withIndex("by_connected_account_id", (index) =>
					index.eq("connectedAccountId", account._id),
				)
				.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
		),
	);
	const integrations = integrationGroups.flat();

	for (const [table, rows] of [
		["connectedAccounts", connectedAccounts],
		["emailIntegrations", integrations],
		["emailInboxes", inboxes],
		["emailThreads", threads],
		["contacts", contacts],
		["entityTypes", entityTypes],
		["cases", cases],
		["globalSearchEntries", globalSearchEntries],
		["agentTasks", agentTasks],
	] as const) {
		requireBoundedRows(table, rows);
	}

	const [
		fieldDefinitionGroups,
		entityGroups,
		caseEventGroups,
		caseContactGroups,
		caseEntityGroups,
		caseCaseOutgoingGroups,
		caseCaseIncomingGroups,
		caseEmailGroups,
		caseEmbeddingGroups,
		externalReferenceGroups,
		messageGroups,
		draftGroups,
		turnGroups,
		webhookTaskGroups,
		ingestEventGroups,
	] = await Promise.all([
		Promise.all(
			entityTypes.map((entityType) =>
				ctx.db
					.query("entityFieldDefinitions")
					.withIndex("by_entity_type_id_and_position", (index) =>
						index.eq("entityTypeId", entityType._id),
					)
					.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
			),
		),
		Promise.all(
			entityTypes.map((entityType) =>
				ctx.db
					.query("entities")
					.withIndex("by_entity_type_id_and_display_name", (index) =>
						index.eq("entityTypeId", entityType._id),
					)
					.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
			),
		),
		Promise.all(
			cases.map((caseRecord) =>
				ctx.db
					.query("caseEvents")
					.withIndex("by_case_id_and_occurred_at", (index) =>
						index.eq("caseId", caseRecord._id),
					)
					.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
			),
		),
		Promise.all(
			cases.map((caseRecord) =>
				ctx.db
					.query("caseContactRelations")
					.withIndex("by_case_id_and_ended_at", (index) =>
						index.eq("caseId", caseRecord._id),
					)
					.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
			),
		),
		Promise.all(
			cases.map((caseRecord) =>
				ctx.db
					.query("caseEntityRelations")
					.withIndex("by_case_id_and_ended_at", (index) =>
						index.eq("caseId", caseRecord._id),
					)
					.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
			),
		),
		Promise.all(
			cases.map((caseRecord) =>
				ctx.db
					.query("caseCaseRelations")
					.withIndex("by_case_id_and_ended_at", (index) =>
						index.eq("caseId", caseRecord._id),
					)
					.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
			),
		),
		Promise.all(
			cases.map((caseRecord) =>
				ctx.db
					.query("caseCaseRelations")
					.withIndex("by_related_case_id_and_ended_at", (index) =>
						index.eq("relatedCaseId", caseRecord._id),
					)
					.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
			),
		),
		Promise.all(
			cases.map((caseRecord) =>
				ctx.db
					.query("caseEmailThreadRelations")
					.withIndex("by_case_id_and_ended_at", (index) =>
						index.eq("caseId", caseRecord._id),
					)
					.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
			),
		),
		Promise.all(
			cases.map((caseRecord) =>
				ctx.db
					.query("caseEmbeddings")
					.withIndex("by_case_id", (index) =>
						index.eq("caseId", caseRecord._id),
					)
					.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
			),
		),
		Promise.all(
			threads.map((thread) =>
				ctx.db
					.query("emailThreadExternalReferences")
					.withIndex("by_thread_id", (index) =>
						index.eq("threadId", thread._id),
					)
					.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
			),
		),
		Promise.all(
			threads.map((thread) =>
				ctx.db
					.query("emailMessages")
					.withIndex("by_thread_id_and_sent_at", (index) =>
						index.eq("threadId", thread._id),
					)
					.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
			),
		),
		Promise.all(
			threads.map((thread) =>
				ctx.db
					.query("emailDrafts")
					.withIndex("by_thread_id_and_author_member_id", (index) =>
						index.eq("threadId", thread._id),
					)
					.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
			),
		),
		Promise.all(
			agentTasks.map((task) =>
				ctx.db
					.query("agentTurns")
					.withIndex("by_task_id_and_sequence", (index) =>
						index.eq("taskId", task._id),
					)
					.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
			),
		),
		Promise.all(
			integrations.map((integration) =>
				ctx.db
					.query("emailIntegrationWebhookCleanupTasks")
					.withIndex("by_integration_id_and_webhook_id", (index) =>
						index.eq("integrationId", integration._id),
					)
					.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
			),
		),
		Promise.all(
			integrations.map((integration) =>
				ctx.db
					.query("emailIngestEvents")
					.withIndex("by_integration_id_and_external_event_id", (index) =>
						index.eq("integrationId", integration._id),
					)
					.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
			),
		),
	]);

	const entityFieldDefinitions = fieldDefinitionGroups.flat();
	const entities = entityGroups.flat();
	const caseEvents = caseEventGroups.flat();
	const caseContactRelations = caseContactGroups.flat();
	const caseEntityRelations = caseEntityGroups.flat();
	const caseCaseRelations = uniqueDocuments([
		...caseCaseOutgoingGroups,
		...caseCaseIncomingGroups,
	]);
	const caseEmailThreadRelations = caseEmailGroups.flat();
	const caseEmbeddings = caseEmbeddingGroups.flat();
	const emailThreadExternalReferences = externalReferenceGroups.flat();
	const emailMessages = messageGroups.flat();
	const emailDrafts = draftGroups.flat();
	const agentTurns = turnGroups.flat();
	const emailIntegrationWebhookCleanupTasks = webhookTaskGroups.flat();
	const emailIngestEvents = ingestEventGroups.flat();

	const [
		textValueGroups,
		numberValueGroups,
		booleanValueGroups,
		dateValueGroups,
		sendGroups,
		runGroups,
		ingestRecipientGroups,
	] = await Promise.all([
		Promise.all(
			entities.map((entity) =>
				ctx.db
					.query("entityTextFieldValues")
					.withIndex("by_entity_id_and_field_definition_id", (index) =>
						index.eq("entityId", entity._id),
					)
					.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
			),
		),
		Promise.all(
			entities.map((entity) =>
				ctx.db
					.query("entityNumberFieldValues")
					.withIndex("by_entity_id_and_field_definition_id", (index) =>
						index.eq("entityId", entity._id),
					)
					.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
			),
		),
		Promise.all(
			entities.map((entity) =>
				ctx.db
					.query("entityBooleanFieldValues")
					.withIndex("by_entity_id_and_field_definition_id", (index) =>
						index.eq("entityId", entity._id),
					)
					.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
			),
		),
		Promise.all(
			entities.map((entity) =>
				ctx.db
					.query("entityDateFieldValues")
					.withIndex("by_entity_id_and_field_definition_id", (index) =>
						index.eq("entityId", entity._id),
					)
					.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
			),
		),
		Promise.all(
			emailMessages.map((message) =>
				ctx.db
					.query("emailSends")
					.withIndex("by_message_id", (index) =>
						index.eq("messageId", message._id),
					)
					.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
			),
		),
		Promise.all(
			agentTurns.map((turn) =>
				ctx.db
					.query("agentRuns")
					.withIndex("by_turn_id_and_requested_at", (index) =>
						index.eq("turnId", turn._id),
					)
					.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
			),
		),
		Promise.all(
			emailIngestEvents.map((event) =>
				ctx.db
					.query("emailIngestRecipients")
					.withIndex("by_event_id_and_address", (index) =>
						index.eq("eventId", event._id),
					)
					.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
			),
		),
	]);

	const entityTextFieldValues = textValueGroups.flat();
	const entityNumberFieldValues = numberValueGroups.flat();
	const entityBooleanFieldValues = booleanValueGroups.flat();
	const entityDateFieldValues = dateValueGroups.flat();
	const emailSends = sendGroups.flat();
	const agentRuns = runGroups.flat();
	const emailIngestRecipients = ingestRecipientGroups.flat();
	const itemGroups = await Promise.all(
		agentTurns.map((turn) =>
			ctx.db
				.query("agentItems")
				.withIndex("by_turn_id_and_sequence", (index) =>
					index.eq("turnId", turn._id),
				)
				.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
		),
	);
	const agentItems = itemGroups.flat();

	const graph = {
		organization,
		members,
		emailIntegrationWebhookCleanupTasks,
		connectedAccounts,
		emailIntegrations: integrations,
		emailInboxes: inboxes,
		emailThreads: threads,
		emailThreadExternalReferences,
		contacts,
		entityTypes,
		entityFieldDefinitions,
		entities,
		entityTextFieldValues,
		entityNumberFieldValues,
		entityBooleanFieldValues,
		entityDateFieldValues,
		cases,
		agentTasks,
		agentTurns,
		agentRuns,
		agentItems,
		caseEmbeddings,
		globalSearchEntries,
		caseEvents,
		caseContactRelations,
		caseEntityRelations,
		caseCaseRelations,
		caseEmailThreadRelations,
		emailMessages,
		emailDrafts,
		emailSends,
		emailIngestEvents,
		emailIngestRecipients,
	};
	for (const table of ACME_REPLACEABLE_TABLES) {
		requireBoundedRows(table, graph[table]);
	}
	return graph;
}

type AcmeOrganizationGraph = Awaited<
	ReturnType<typeof collectAcmeOrganizationGraph>
>;

function requireExpectedDeployment(deploymentUrl: string) {
	if (deploymentUrl !== ACME_DEPLOYMENT_URL) {
		throw new Error(
			"Acme replacement aborted: deployment URL argument changed",
		);
	}
	if (process.env.CONVEX_CLOUD_URL !== ACME_DEPLOYMENT_URL) {
		throw new Error(
			`Acme replacement aborted: runtime deployment is ${process.env.CONVEX_CLOUD_URL ?? "unknown"}, expected ${ACME_DEPLOYMENT_URL}`,
		);
	}
}

function requireExpectedOrganization(graph: AcmeOrganizationGraph) {
	if (
		graph.organization.name !== "Acme AB" ||
		graph.organization.workosOrganizationId !== ACME_WORKOS_ORGANIZATION_ID ||
		!graph.organization.active
	) {
		throw new Error(
			"Acme replacement aborted: organization identity does not match the reviewed Acme organization",
		);
	}
	const activeMembers = graph.members.filter((member) => member.active);
	if (activeMembers.length !== 1) {
		throw new Error(
			"Acme replacement aborted: exactly one active Acme member is required for deterministic ownership",
		);
	}
	return activeMembers[0];
}

function requireSubset(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(`Acme replacement aborted: ${message}`);
	}
}

async function requireNoCrossOrganizationReferences(
	ctx: DatabaseContext,
	graph: AcmeOrganizationGraph,
) {
	const organizationId = graph.organization._id;
	const memberIds = new Set(graph.members.map((row) => row._id));
	const connectedAccountIds = new Set(
		graph.connectedAccounts.map((row) => row._id),
	);
	const integrationIds = new Set(graph.emailIntegrations.map((row) => row._id));
	const inboxIds = new Set(graph.emailInboxes.map((row) => row._id));
	const threadIds = new Set(graph.emailThreads.map((row) => row._id));
	const contactIds = new Set(graph.contacts.map((row) => row._id));
	const entityTypeIds = new Set(graph.entityTypes.map((row) => row._id));
	const entityIds = new Set(graph.entities.map((row) => row._id));
	const caseIds = new Set(graph.cases.map((row) => row._id));
	const taskIds = new Set(graph.agentTasks.map((row) => row._id));
	const turnIds = new Set(graph.agentTurns.map((row) => row._id));
	const runIds = new Set(graph.agentRuns.map((row) => row._id));
	const itemIds = new Set(graph.agentItems.map((row) => row._id));
	const messageIds = new Set(graph.emailMessages.map((row) => row._id));
	const ingestEventIds = new Set(graph.emailIngestEvents.map((row) => row._id));
	const entityById = new Map(graph.entities.map((row) => [row._id, row]));
	const fieldById = new Map(
		graph.entityFieldDefinitions.map((row) => [row._id, row]),
	);
	const messageById = new Map(graph.emailMessages.map((row) => [row._id, row]));
	const requireAcmeMember = (
		memberId: Id<"organizationMembers"> | null,
		message: string,
	) => {
		if (memberId !== null) {
			requireSubset(memberIds.has(memberId), message);
		}
	};

	for (const connectedAccount of graph.connectedAccounts) {
		requireSubset(
			connectedAccount.organizationId === organizationId,
			"connected account is outside Acme",
		);
	}
	for (const integration of graph.emailIntegrations) {
		requireSubset(
			connectedAccountIds.has(integration.connectedAccountId),
			"email integration is outside Acme",
		);
	}
	for (const inbox of graph.emailInboxes) {
		requireSubset(
			inbox.organizationId === organizationId,
			"inbox is outside Acme",
		);
	}
	for (const thread of graph.emailThreads) {
		requireSubset(
			thread.organizationId === organizationId && inboxIds.has(thread.inboxId),
			"email thread has an external inbox",
		);
		if (thread.latestMessageId) {
			const latestMessage = messageById.get(thread.latestMessageId);
			requireSubset(
				latestMessage?.threadId === thread._id &&
					latestMessage.inboxId === thread.inboxId,
				"email thread has an external latest message",
			);
		}
	}
	for (const contact of graph.contacts) {
		requireSubset(
			contact.organizationId === organizationId,
			"contact is outside Acme",
		);
	}
	for (const entityType of graph.entityTypes) {
		requireSubset(
			entityType.organizationId === organizationId,
			"entity type is outside Acme",
		);
	}
	for (const field of graph.entityFieldDefinitions) {
		requireSubset(
			entityTypeIds.has(field.entityTypeId),
			"entity field points outside Acme",
		);
	}
	for (const entity of graph.entities) {
		requireSubset(
			entityTypeIds.has(entity.entityTypeId),
			"entity points outside Acme",
		);
	}
	for (const values of [
		graph.entityTextFieldValues,
		graph.entityNumberFieldValues,
		graph.entityBooleanFieldValues,
		graph.entityDateFieldValues,
	]) {
		for (const value of values) {
			const entity = entityById.get(value.entityId);
			const field = fieldById.get(value.fieldDefinitionId);
			requireSubset(
				entity !== undefined &&
					field !== undefined &&
					entity.entityTypeId === field.entityTypeId,
				"entity value crosses organization scope",
			);
		}
	}
	for (const caseRecord of graph.cases) {
		requireSubset(
			caseRecord.organizationId === organizationId,
			"case is outside Acme",
		);
		if (caseRecord.ownerMemberId) {
			requireSubset(
				memberIds.has(caseRecord.ownerMemberId),
				"case owner is outside Acme",
			);
		}
	}
	for (const task of graph.agentTasks) {
		requireSubset(
			task.organizationId === organizationId && caseIds.has(task.anchorCaseId),
			"agent task crosses organization scope",
		);
		if (task.requestedByMemberId) {
			requireSubset(
				memberIds.has(task.requestedByMemberId),
				"agent task requester is outside Acme",
			);
		}
		requireSubset(
			task.activeRunIds.every((runId) => runIds.has(runId)),
			"agent task has an external active run",
		);
		requireSubset(
			task.activeApprovalIds.every((itemId) => itemIds.has(itemId)),
			"agent task has an external active approval",
		);
	}
	for (const turn of graph.agentTurns) {
		requireSubset(taskIds.has(turn.taskId), "agent turn points outside Acme");
		if (turn.requestedByMemberId) {
			requireSubset(
				memberIds.has(turn.requestedByMemberId),
				"agent turn requester is outside Acme",
			);
		}
	}
	for (const run of graph.agentRuns) {
		requireSubset(turnIds.has(run.turnId), "agent run points outside Acme");
		if (run.selectedStatusItemId) {
			requireSubset(
				itemIds.has(run.selectedStatusItemId),
				"agent run has an external status item",
			);
		}
	}
	for (const item of graph.agentItems) {
		requireSubset(turnIds.has(item.turnId), "agent item points outside Acme");
		if ("runId" in item) {
			requireSubset(runIds.has(item.runId), "agent item has an external run");
		}
		if ("memberId" in item) {
			requireSubset(
				memberIds.has(item.memberId),
				"agent item member is outside Acme",
			);
		}
		if ("answeredByMemberId" in item) {
			requireSubset(
				memberIds.has(item.answeredByMemberId),
				"agent approval answer is outside Acme",
			);
		}
		if ("toolItemId" in item) {
			requireSubset(
				itemIds.has(item.toolItemId),
				"agent approval has an external tool item",
			);
		}
		if ("continuationRunId" in item && item.continuationRunId) {
			requireSubset(
				runIds.has(item.continuationRunId),
				"agent approval has an external continuation run",
			);
		}
	}
	for (const embedding of graph.caseEmbeddings) {
		requireSubset(
			embedding.organizationId === organizationId &&
				caseIds.has(embedding.caseId),
			"case embedding crosses organization scope",
		);
	}
	for (const entry of graph.globalSearchEntries) {
		requireSubset(
			entry.organizationId === organizationId,
			"search entry is outside Acme",
		);
		switch (entry.target.kind) {
			case "contact":
				requireSubset(
					contactIds.has(entry.target.contactId),
					"search contact is external",
				);
				break;
			case "case":
				requireSubset(
					caseIds.has(entry.target.caseId),
					"search case is external",
				);
				break;
			case "entity": {
				const entity = entityById.get(entry.target.entityId);
				requireSubset(
					entity?.entityTypeId === entry.target.entityTypeId &&
						entityTypeIds.has(entry.target.entityTypeId),
					"search entity is external",
				);
				break;
			}
		}
	}
	for (const event of graph.caseEvents) {
		requireSubset(caseIds.has(event.caseId), "case event points outside Acme");
		if (event.createdByMemberId) {
			requireSubset(
				memberIds.has(event.createdByMemberId),
				"case event author is outside Acme",
			);
		}
		if ("emailMessageId" in event) {
			requireSubset(
				messageIds.has(event.emailMessageId),
				"case event email is outside Acme",
			);
		}
		if ("agentTaskId" in event) {
			requireSubset(
				taskIds.has(event.agentTaskId),
				"case event agent task is outside Acme",
			);
		}
	}
	for (const relation of graph.caseContactRelations) {
		requireSubset(
			caseIds.has(relation.caseId) && contactIds.has(relation.contactId),
			"case-contact relation crosses organization scope",
		);
		requireAcmeMember(
			relation.addedByMemberId,
			"case-contact relation author is outside Acme",
		);
		requireAcmeMember(
			relation.removedByMemberId,
			"case-contact relation remover is outside Acme",
		);
	}
	for (const relation of graph.caseEntityRelations) {
		requireSubset(
			caseIds.has(relation.caseId) && entityIds.has(relation.entityId),
			"case-entity relation crosses organization scope",
		);
		requireAcmeMember(
			relation.addedByMemberId,
			"case-entity relation author is outside Acme",
		);
		requireAcmeMember(
			relation.removedByMemberId,
			"case-entity relation remover is outside Acme",
		);
	}
	for (const relation of graph.caseCaseRelations) {
		requireSubset(
			relation.caseId !== relation.relatedCaseId &&
				caseIds.has(relation.caseId) &&
				caseIds.has(relation.relatedCaseId),
			"case-case relation crosses organization scope",
		);
		requireAcmeMember(
			relation.addedByMemberId,
			"case-case relation author is outside Acme",
		);
		requireAcmeMember(
			relation.removedByMemberId,
			"case-case relation remover is outside Acme",
		);
	}
	for (const relation of graph.caseEmailThreadRelations) {
		requireSubset(
			caseIds.has(relation.caseId) && threadIds.has(relation.threadId),
			"case-email relation crosses organization scope",
		);
		requireAcmeMember(
			relation.linkedByMemberId,
			"case-email relation author is outside Acme",
		);
		requireAcmeMember(
			relation.unlinkedByMemberId,
			"case-email relation remover is outside Acme",
		);
	}
	for (const reference of graph.emailThreadExternalReferences) {
		requireSubset(
			threadIds.has(reference.threadId) &&
				inboxIds.has(reference.inboxId) &&
				integrationIds.has(reference.integrationId),
			"email external reference crosses organization scope",
		);
	}
	for (const message of graph.emailMessages) {
		requireSubset(
			threadIds.has(message.threadId) &&
				inboxIds.has(message.inboxId) &&
				integrationIds.has(message.integrationId),
			"email message crosses organization scope",
		);
		if (message.direction === "inbound") {
			requireSubset(
				contactIds.has(message.senderContactId),
				"email sender contact is outside Acme",
			);
		} else {
			requireSubset(
				memberIds.has(message.authoredByMemberId),
				"email author is outside Acme",
			);
		}
	}
	for (const draft of graph.emailDrafts) {
		requireSubset(
			threadIds.has(draft.threadId) && memberIds.has(draft.authorMemberId),
			"email draft crosses organization scope",
		);
	}
	for (const send of graph.emailSends) {
		requireSubset(
			messageIds.has(send.messageId) && memberIds.has(send.requestedByMemberId),
			"email send crosses organization scope",
		);
	}
	for (const task of graph.emailIntegrationWebhookCleanupTasks) {
		requireSubset(
			integrationIds.has(task.integrationId),
			"webhook cleanup task crosses organization scope",
		);
	}
	for (const event of graph.emailIngestEvents) {
		requireSubset(
			integrationIds.has(event.integrationId) &&
				(!event.inboxId || inboxIds.has(event.inboxId)),
			"email ingest event crosses organization scope",
		);
	}
	for (const recipient of graph.emailIngestRecipients) {
		requireSubset(
			ingestEventIds.has(recipient.eventId),
			"email ingest recipient crosses organization scope",
		);
	}

	const [
		allThreads,
		allMessages,
		allExternalReferences,
		allCaseEntityRelations,
		allSearchEntries,
		allAgentTasks,
		allIngestEvents,
	] = await Promise.all([
		ctx.db.query("emailThreads").take(MAX_SCANNED_ROWS_PER_TABLE + 1),
		ctx.db.query("emailMessages").take(MAX_SCANNED_ROWS_PER_TABLE + 1),
		ctx.db
			.query("emailThreadExternalReferences")
			.take(MAX_SCANNED_ROWS_PER_TABLE + 1),
		ctx.db.query("caseEntityRelations").take(MAX_SCANNED_ROWS_PER_TABLE + 1),
		ctx.db.query("globalSearchEntries").take(MAX_SCANNED_ROWS_PER_TABLE + 1),
		ctx.db.query("agentTasks").take(MAX_SCANNED_ROWS_PER_TABLE + 1),
		ctx.db.query("emailIngestEvents").take(MAX_SCANNED_ROWS_PER_TABLE + 1),
	]);
	for (const rows of [
		allThreads,
		allMessages,
		allExternalReferences,
		allCaseEntityRelations,
		allSearchEntries,
		allAgentTasks,
		allIngestEvents,
	]) {
		requireSubset(
			rows.length <= MAX_SCANNED_ROWS_PER_TABLE,
			"cross-organization scan exceeded its safety limit",
		);
	}
	for (const thread of allThreads) {
		if (
			thread.organizationId === organizationId ||
			inboxIds.has(thread.inboxId)
		) {
			requireSubset(
				threadIds.has(thread._id),
				"another organization references an Acme inbox",
			);
		}
	}
	for (const message of allMessages) {
		const touchesAcme =
			threadIds.has(message.threadId) ||
			inboxIds.has(message.inboxId) ||
			integrationIds.has(message.integrationId) ||
			(message.direction === "inbound"
				? contactIds.has(message.senderContactId)
				: memberIds.has(message.authoredByMemberId));
		if (touchesAcme) {
			requireSubset(
				messageIds.has(message._id),
				"another organization references Acme email data",
			);
		}
	}
	for (const reference of allExternalReferences) {
		if (
			threadIds.has(reference.threadId) ||
			inboxIds.has(reference.inboxId) ||
			integrationIds.has(reference.integrationId)
		) {
			requireSubset(
				graph.emailThreadExternalReferences.some(
					(candidate) => candidate._id === reference._id,
				),
				"another organization references an Acme email route",
			);
		}
	}
	for (const relation of allCaseEntityRelations) {
		if (caseIds.has(relation.caseId) || entityIds.has(relation.entityId)) {
			requireSubset(
				caseIds.has(relation.caseId) && entityIds.has(relation.entityId),
				"another organization shares an Acme case-entity relation",
			);
		}
	}
	for (const entry of allSearchEntries) {
		const targetTouchesAcme =
			(entry.target.kind === "contact" &&
				contactIds.has(entry.target.contactId)) ||
			(entry.target.kind === "case" && caseIds.has(entry.target.caseId)) ||
			(entry.target.kind === "entity" && entityIds.has(entry.target.entityId));
		if (entry.organizationId === organizationId || targetTouchesAcme) {
			requireSubset(
				graph.globalSearchEntries.some(
					(candidate) => candidate._id === entry._id,
				),
				"another organization has an Acme search target",
			);
		}
	}
	for (const task of allAgentTasks) {
		if (
			task.organizationId === organizationId ||
			caseIds.has(task.anchorCaseId)
		) {
			requireSubset(
				taskIds.has(task._id),
				"another organization has an agent task anchored to Acme",
			);
		}
	}
	for (const event of allIngestEvents) {
		if (
			integrationIds.has(event.integrationId) ||
			(event.inboxId ? inboxIds.has(event.inboxId) : false)
		) {
			requireSubset(
				ingestEventIds.has(event._id),
				"another organization references an Acme ingest route",
			);
		}
	}

	const contactRelationGroups = await Promise.all(
		graph.contacts.map((contact) =>
			ctx.db
				.query("caseContactRelations")
				.withIndex("by_contact_id_and_ended_at", (index) =>
					index.eq("contactId", contact._id),
				)
				.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
		),
	);
	for (const relation of contactRelationGroups.flat()) {
		requireSubset(
			caseIds.has(relation.caseId),
			"another organization shares an Acme contact relation",
		);
	}
	const threadRelationGroups = await Promise.all(
		graph.emailThreads.map((thread) =>
			ctx.db
				.query("caseEmailThreadRelations")
				.withIndex("by_thread_id_and_ended_at", (index) =>
					index.eq("threadId", thread._id),
				)
				.take(MAX_ROWS_PER_REPLACEMENT_TABLE + 1),
		),
	);
	for (const relation of threadRelationGroups.flat()) {
		requireSubset(
			caseIds.has(relation.caseId),
			"another organization shares an Acme email relation",
		);
	}
}

function countGraphRows(graph: AcmeOrganizationGraph) {
	const counts = createEmptyAcmeReplacementCounts();
	for (const table of ACME_REPLACEABLE_TABLES) {
		counts[table] = graph[table].length;
	}
	return counts;
}

function requireCountsMatch(
	label: string,
	expected: AcmeReplacementCounts,
	actual: AcmeReplacementCounts,
) {
	for (const table of ACME_REPLACEABLE_TABLES) {
		if (
			!Number.isInteger(expected[table]) ||
			expected[table] < 0 ||
			expected[table] !== actual[table]
		) {
			throw new Error(
				`Acme replacement aborted: ${label} count for ${table} is ${actual[table]}, expected ${expected[table]}`,
			);
		}
	}
}

export function createAcmePreviewToken(
	organizationId: string,
	removalCounts: AcmeReplacementCounts,
	creationCounts: AcmeReplacementCounts,
) {
	const countSignature = (counts: AcmeReplacementCounts) =>
		ACME_REPLACEABLE_TABLES.map((table) => `${table}:${counts[table]}`).join(
			",",
		);
	return `acme-preview-${ACME_DATASET_VERSION}-${hashAcmePayload(
		[
			ACME_DEPLOYMENT_URL,
			organizationId,
			calculateAcmeDatasetFingerprint(),
			countSignature(removalCounts),
			countSignature(creationCounts),
		].join("|"),
	)}`;
}

async function deleteAcmeOrganizationGraph(
	ctx: MutationCtx,
	graph: AcmeOrganizationGraph,
) {
	for (const row of graph.agentItems)
		await ctx.db.delete("agentItems", row._id);
	for (const row of graph.agentRuns) await ctx.db.delete("agentRuns", row._id);
	for (const row of graph.agentTurns)
		await ctx.db.delete("agentTurns", row._id);
	for (const row of graph.caseEvents)
		await ctx.db.delete("caseEvents", row._id);
	for (const row of graph.agentTasks)
		await ctx.db.delete("agentTasks", row._id);
	for (const row of graph.emailSends)
		await ctx.db.delete("emailSends", row._id);
	for (const row of graph.emailDrafts)
		await ctx.db.delete("emailDrafts", row._id);
	for (const row of graph.caseContactRelations)
		await ctx.db.delete("caseContactRelations", row._id);
	for (const row of graph.caseEntityRelations)
		await ctx.db.delete("caseEntityRelations", row._id);
	for (const row of graph.caseCaseRelations)
		await ctx.db.delete("caseCaseRelations", row._id);
	for (const row of graph.caseEmailThreadRelations)
		await ctx.db.delete("caseEmailThreadRelations", row._id);
	for (const row of graph.caseEmbeddings)
		await ctx.db.delete("caseEmbeddings", row._id);
	for (const row of graph.globalSearchEntries)
		await ctx.db.delete("globalSearchEntries", row._id);
	for (const row of graph.emailThreadExternalReferences)
		await ctx.db.delete("emailThreadExternalReferences", row._id);
	for (const row of graph.emailMessages)
		await ctx.db.delete("emailMessages", row._id);
	for (const row of graph.emailThreads)
		await ctx.db.delete("emailThreads", row._id);
	for (const row of graph.emailIngestRecipients)
		await ctx.db.delete("emailIngestRecipients", row._id);
	for (const row of graph.emailIngestEvents)
		await ctx.db.delete("emailIngestEvents", row._id);
	for (const row of graph.emailIntegrationWebhookCleanupTasks)
		await ctx.db.delete("emailIntegrationWebhookCleanupTasks", row._id);
	for (const row of graph.emailInboxes)
		await ctx.db.delete("emailInboxes", row._id);
	for (const row of graph.emailIntegrations)
		await ctx.db.delete("emailIntegrations", row._id);
	for (const row of graph.connectedAccounts)
		await ctx.db.delete("connectedAccounts", row._id);
	for (const row of graph.cases) await ctx.db.delete("cases", row._id);
	for (const row of graph.entityTextFieldValues)
		await ctx.db.delete("entityTextFieldValues", row._id);
	for (const row of graph.entityNumberFieldValues)
		await ctx.db.delete("entityNumberFieldValues", row._id);
	for (const row of graph.entityBooleanFieldValues)
		await ctx.db.delete("entityBooleanFieldValues", row._id);
	for (const row of graph.entityDateFieldValues)
		await ctx.db.delete("entityDateFieldValues", row._id);
	for (const row of graph.entities) await ctx.db.delete("entities", row._id);
	for (const row of graph.entityFieldDefinitions)
		await ctx.db.delete("entityFieldDefinitions", row._id);
	for (const row of graph.entityTypes)
		await ctx.db.delete("entityTypes", row._id);
	for (const row of graph.contacts) await ctx.db.delete("contacts", row._id);
}

async function inspectValidatedReplacement(
	ctx: DatabaseContext,
	args: {
		deploymentUrl: string;
		organizationId: Id<"organizations">;
	},
) {
	requireExpectedDeployment(args.deploymentUrl);
	const graph = await collectAcmeOrganizationGraph(ctx, args.organizationId);
	const owner = requireExpectedOrganization(graph);
	await requireNoCrossOrganizationReferences(ctx, graph);
	const removalCounts = countGraphRows(graph);
	const creationCounts = calculateAcmeCreationCounts();
	return {
		graph,
		owner,
		removalCounts,
		creationCounts,
		datasetFingerprint: calculateAcmeDatasetFingerprint(),
		previewToken: createAcmePreviewToken(
			args.organizationId,
			removalCounts,
			creationCounts,
		),
	};
}

export const preview = internalQuery({
	args: {
		deploymentUrl: v.literal(ACME_DEPLOYMENT_URL),
		organizationId: v.id("organizations"),
	},
	returns: v.object({
		deploymentName: v.literal(ACME_DEPLOYMENT_NAME),
		deploymentUrl: v.literal(ACME_DEPLOYMENT_URL),
		organizationId: v.id("organizations"),
		organizationName: v.literal("Acme AB"),
		workosOrganizationId: v.literal(ACME_WORKOS_ORGANIZATION_ID),
		datasetVersion: v.literal(ACME_DATASET_VERSION),
		datasetFingerprint: v.string(),
		preservedOrganizationMembers: v.number(),
		removalCounts: replacementCountsValidator,
		creationCounts: replacementCountsValidator,
		previewToken: v.string(),
	}),
	handler: async (ctx, args) => {
		const inspection = await inspectValidatedReplacement(ctx, args);
		return {
			deploymentName: ACME_DEPLOYMENT_NAME,
			deploymentUrl: ACME_DEPLOYMENT_URL,
			organizationId: inspection.graph.organization._id,
			organizationName: "Acme AB" as const,
			workosOrganizationId: ACME_WORKOS_ORGANIZATION_ID,
			datasetVersion: ACME_DATASET_VERSION,
			datasetFingerprint: inspection.datasetFingerprint,
			preservedOrganizationMembers: inspection.graph.members.length,
			removalCounts: inspection.removalCounts,
			creationCounts: inspection.creationCounts,
			previewToken: inspection.previewToken,
		};
	},
});

export const replace = internalMutation({
	args: {
		deploymentUrl: v.literal(ACME_DEPLOYMENT_URL),
		organizationId: v.id("organizations"),
		expectedWorkosOrganizationId: v.literal(ACME_WORKOS_ORGANIZATION_ID),
		expectedRemovalCounts: replacementCountsValidator,
		expectedCreationCounts: replacementCountsValidator,
		previewToken: v.string(),
		confirmation: v.literal(REPLACEMENT_CONFIRMATION),
	},
	returns: v.object({
		datasetVersion: v.literal(ACME_DATASET_VERSION),
		datasetFingerprint: v.string(),
		organizationId: v.id("organizations"),
		preservedOrganizationMembers: v.number(),
		removed: replacementCountsValidator,
		created: replacementCountsValidator,
	}),
	handler: async (ctx, args) => {
		const inspection = await inspectValidatedReplacement(ctx, args);
		requireCountsMatch(
			"removal",
			args.expectedRemovalCounts,
			inspection.removalCounts,
		);
		requireCountsMatch(
			"creation",
			args.expectedCreationCounts,
			inspection.creationCounts,
		);
		if (args.previewToken !== inspection.previewToken) {
			throw new Error(
				"Acme replacement aborted: preview token is stale or belongs to another plan",
			);
		}

		await deleteAcmeOrganizationGraph(ctx, inspection.graph);
		const inserted = await insertAcmeDataset(
			ctx,
			inspection.graph.organization,
			inspection.owner,
		);
		requireCountsMatch("inserted", inspection.creationCounts, inserted.counts);

		const finalGraph = await collectAcmeOrganizationGraph(
			ctx,
			inspection.graph.organization._id,
		);
		requireExpectedOrganization(finalGraph);
		await requireNoCrossOrganizationReferences(ctx, finalGraph);
		const finalCounts = countGraphRows(finalGraph);
		requireCountsMatch("final", inspection.creationCounts, finalCounts);

		return {
			datasetVersion: ACME_DATASET_VERSION,
			datasetFingerprint: inspection.datasetFingerprint,
			organizationId: inspection.graph.organization._id,
			preservedOrganizationMembers: inspection.graph.members.length,
			removed: inspection.removalCounts,
			created: finalCounts,
		};
	},
});
