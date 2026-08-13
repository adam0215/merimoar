import { Migrations } from "@convex-dev/migrations";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { DataModel, Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import {
	computeCustomToolConfigurationHash,
	computeLegacyCustomToolConfigurationHash,
} from "./agent/customToolModel";

const migrations = new Migrations<DataModel>(components.migrations);

const MAX_EMAIL_INTEGRATION_REFERENCE_REPAIRS = 500;

export const repairOrphanedEmailIntegrationReferences = internalMutation({
	args: {
		organizationId: v.id("organizations"),
		orphanedIntegrationId: v.id("emailIntegrations"),
		replacementIntegrationId: v.id("emailIntegrations"),
		expectedMessageCount: v.number(),
		expectedThreadReferenceCount: v.number(),
		dryRun: v.boolean(),
	},
	returns: v.object({
		messageCount: v.number(),
		threadReferenceCount: v.number(),
	}),
	handler: async (ctx, args) => {
		if (args.orphanedIntegrationId === args.replacementIntegrationId) {
			throw new Error("Replacement integration must differ from the orphan");
		}
		if (await ctx.db.get(args.orphanedIntegrationId)) {
			throw new Error("The integration being repaired is not orphaned");
		}

		const replacement = await ctx.db.get(args.replacementIntegrationId);
		const connectedAccount = replacement
			? await ctx.db.get(replacement.connectedAccountId)
			: null;
		if (
			!replacement ||
			connectedAccount?.organizationId !== args.organizationId
		) {
			throw new Error(
				"Replacement integration belongs to another organization",
			);
		}

		const [messages, threadReferences] = await Promise.all([
			ctx.db
				.query("emailMessages")
				.filter((filter) =>
					filter.eq(filter.field("integrationId"), args.orphanedIntegrationId),
				)
				.take(MAX_EMAIL_INTEGRATION_REFERENCE_REPAIRS + 1),
			ctx.db
				.query("emailThreadExternalReferences")
				.filter((filter) =>
					filter.eq(filter.field("integrationId"), args.orphanedIntegrationId),
				)
				.take(MAX_EMAIL_INTEGRATION_REFERENCE_REPAIRS + 1),
		]);

		if (
			messages.length !== args.expectedMessageCount ||
			threadReferences.length !== args.expectedThreadReferenceCount
		) {
			throw new Error(
				`Expected ${args.expectedMessageCount} messages and ${args.expectedThreadReferenceCount} thread references, found ${messages.length} and ${threadReferences.length}`,
			);
		}

		for (const message of messages) {
			const [thread, inbox] = await Promise.all([
				ctx.db.get(message.threadId),
				ctx.db.get(message.inboxId),
			]);
			if (
				!thread ||
				!inbox ||
				thread.organizationId !== args.organizationId ||
				inbox.organizationId !== args.organizationId ||
				thread.inboxId !== inbox._id
			) {
				throw new Error(`Email message ${message._id} crosses organizations`);
			}
		}

		for (const reference of threadReferences) {
			const [thread, inbox] = await Promise.all([
				ctx.db.get(reference.threadId),
				ctx.db.get(reference.inboxId),
			]);
			if (
				!thread ||
				!inbox ||
				thread.organizationId !== args.organizationId ||
				inbox.organizationId !== args.organizationId ||
				thread.inboxId !== inbox._id
			) {
				throw new Error(
					`Email thread reference ${reference._id} crosses organizations`,
				);
			}
		}

		if (!args.dryRun) {
			await Promise.all([
				...messages.map((message) =>
					ctx.db.patch(message._id, {
						integrationId: args.replacementIntegrationId,
					}),
				),
				...threadReferences.map((reference) =>
					ctx.db.patch(reference._id, {
						integrationId: args.replacementIntegrationId,
					}),
				),
			]);
		}

		return {
			messageCount: messages.length,
			threadReferenceCount: threadReferences.length,
		};
	},
});

export const normalizeCustomToolPaths = migrations.define({
	table: "agentCustomTools",
	migrateOne: async (ctx, tool) => {
		if (!tool.path.startsWith("/")) {
			return;
		}
		const integration = await ctx.db.get(
			"customIntegrations",
			tool.integrationId,
		);
		if (!integration) {
			throw new Error(`Custom tool ${tool._id} has no integration`);
		}
		if (
			tool.testedConfigurationHash !==
			(await computeLegacyCustomToolConfigurationHash({
				baseUrl: integration.baseUrl,
				path: tool.path,
				parameters: tool.parameters,
			}))
		) {
			throw new Error(`Custom tool ${tool._id} has no valid test proof`);
		}
		const path = tool.path.slice(1);
		await ctx.db.patch("agentCustomTools", tool._id, {
			path,
			testedConfigurationHash: await computeCustomToolConfigurationHash({
				baseUrl: integration.baseUrl,
				path,
				parameters: tool.parameters,
			}),
		});
	},
});

const acmeDemoCamelCaseParameterNames = new Map([
	["property_identifier", "propertyIdentifier"],
	["case_reference", "caseReference"],
	["asset_id", "assetId"],
	["supplier_number", "supplierNumber"],
	["system_id", "systemId"],
	["invoice_number", "invoiceNumber"],
]);

export const camelCaseAcmeDemoToolParameters = migrations.define({
	table: "agentCustomTools",
	migrateOne: async (ctx, tool) => {
		const integration = await ctx.db.get(
			"customIntegrations",
			tool.integrationId,
		);
		if (
			integration?.name !== "MockAPI" ||
			integration.baseUrl !== "http://localhost:8000/"
		) {
			return;
		}
		const parameters = tool.parameters.map((parameter) => ({
			...parameter,
			name:
				acmeDemoCamelCaseParameterNames.get(parameter.name) ?? parameter.name,
		}));
		if (
			parameters.every(
				(parameter, index) => parameter.name === tool.parameters[index]?.name,
			)
		) {
			return;
		}
		await ctx.db.patch("agentCustomTools", tool._id, { parameters });
	},
});

export const backfillOrganizationReferenceSlugs = migrations.define({
	table: "organizations",
	migrateOne: async (ctx, organization) => {
		if (organization.referenceSlug === undefined) {
			await ctx.db.patch("organizations", organization._id, {
				referenceSlug: "CASE",
			});
		}
	},
});

export const typeLegacyCaseEventsAsHumanNotes = migrations.define({
	table: "caseEvents",
	migrateOne: async (ctx, event) => {
		if (!("type" in event)) {
			await ctx.db.patch("caseEvents", event._id, {
				type: "human_note",
			});
		}
	},
});

export const backfillAgentTaskOrganizationIds = migrations.define({
	table: "agentTasks",
	migrateOne: async (ctx, task) => {
		const anchorCase = await ctx.db.get("cases", task.anchorCaseId);
		if (!anchorCase) {
			throw new Error(
				`Agent task ${task._id} references missing case ${task.anchorCaseId}`,
			);
		}
		if (task.organizationId === undefined) {
			await ctx.db.patch("agentTasks", task._id, {
				organizationId: anchorCase.organizationId,
			});
		} else if (task.organizationId !== anchorCase.organizationId) {
			throw new Error(
				`Agent task ${task._id} has a different organization than case ${task.anchorCaseId}`,
			);
		}
	},
});

export const validateAgentTaskOrganizationIds = migrations.define({
	table: "agentTasks",
	migrateOne: async (ctx, task) => {
		const anchorCase = await ctx.db.get("cases", task.anchorCaseId);
		if (!anchorCase) {
			throw new Error(
				`Agent task ${task._id} references missing case ${task.anchorCaseId}`,
			);
		}
		if (task.organizationId !== anchorCase.organizationId) {
			throw new Error(
				`Agent task ${task._id} has a different organization than case ${task.anchorCaseId}`,
			);
		}
	},
});

export const verifyTypedCaseEvents = internalQuery({
	args: {},
	returns: v.object({
		complete: v.boolean(),
		sampleLegacyEventIds: v.array(v.id("caseEvents")),
	}),
	handler: async (ctx) => {
		const legacyEvents = await ctx.db
			.query("caseEvents")
			.withIndex("by_type", (index) => index.eq("type", undefined))
			.take(10);
		return {
			complete: legacyEvents.length === 0,
			sampleLegacyEventIds: legacyEvents.map((event) => event._id),
		};
	},
});

// The previous emailMessages schema already required direction: "inbound" and
// every field in the inbound union branch. The union deployment is therefore a
// schema-compatible widen/narrow change with no data rewrite; this migration
// records a batched validation pass over the rows that existed at deployment.
export const validateInboundMessagesForOutboundUnion = migrations.define({
	table: "emailMessages",
	migrateOne: async (_ctx, message) => {
		if (message.direction !== "inbound" && message.direction !== "outbound") {
			throw new Error("Email message has no supported direction");
		}
		if (
			message.direction === "inbound" &&
			(!message.senderContactId || !message.externalMessageId)
		) {
			throw new Error("Inbound email message is missing required identity");
		}
	},
});

export const scheduleCaseEmbeddingBackfill = migrations.define({
	table: "cases",
	migrateOne: async (ctx, caseRecord) => {
		const existing = await ctx.db
			.query("caseEmbeddings")
			.withIndex("by_case_id", (index) => index.eq("caseId", caseRecord._id))
			.unique();
		if (!existing) {
			await ctx.scheduler.runAfter(0, internal.case.embedding.embedCase, {
				caseId: caseRecord._id,
			});
		}
	},
});

export const reconcileConnectedResendWebhooksForOutboundEvents =
	migrations.define({
		table: "emailIntegrations",
		migrateOne: async (ctx, integration) => {
			const connectedAccount = await ctx.db.get(
				"connectedAccounts",
				integration.connectedAccountId,
			);
			if (
				!connectedAccount ||
				connectedAccount.connectionStatus !== "connected" ||
				!connectedAccount.grantedScopes.includes("full_access")
			) {
				return;
			}
			await ctx.scheduler.runAfter(
				0,
				internal.email.integrationActions.reconcileResendWebhook,
				{
					integrationId: integration._id,
					expectedConnectedAccountId: connectedAccount._id,
					expectedWorkosUpdatedAt: connectedAccount.workosUpdatedAt,
					attempt: 0,
				},
			);
		},
	});

export const preflightConnectedAccountCleanupTasks = migrations.define({
	table: "emailIntegrationWebhookCleanupTasks",
	migrateOne: async (ctx, task) => {
		const integration = await ctx.db.get(
			"emailIntegrations",
			task.integrationId,
		);
		if (!integration) {
			throw new Error(
				`Webhook cleanup task ${task._id} has an orphaned email integration`,
			);
		}
	},
});

export const backfillConnectedAccountSyncEvents = migrations.define({
	table: "emailIntegrationSyncEvents",
	migrateOne: async (ctx, event) => {
		const existing = await ctx.db
			.query("connectedAccountSyncEvents")
			.withIndex("by_source_and_source_event_id", (index) =>
				index
					.eq("source", event.source)
					.eq("sourceEventId", event.sourceEventId),
			)
			.unique();
		if (!existing) {
			await ctx.db.insert("connectedAccountSyncEvents", {
				source: event.source,
				sourceEventId: event.sourceEventId,
				eventType: event.eventType,
				outcome: "legacy_backfill",
				processedAt: event.processedAt,
			});
		}
	},
});

export const validateConnectedAccountSplit = migrations.define({
	table: "emailIntegrations",
	migrateOne: async (ctx, integration) => {
		const account = await ctx.db.get(
			"connectedAccounts",
			integration.connectedAccountId,
		);
		if (!account) {
			throw new Error(
				`Email integration ${integration._id} has an invalid connected account`,
			);
		}
		const organization = await ctx.db.get(
			"organizations",
			account.organizationId,
		);
		if (!organization) {
			throw new Error(`Connected account ${account._id} has no organization`);
		}
		await ctx.db
			.query("emailIntegrations")
			.withIndex("by_connected_account_id", (index) =>
				index.eq("connectedAccountId", account._id),
			)
			.unique();
		await ctx.db
			.query("connectedAccounts")
			.withIndex("by_workos_connected_account_id", (index) =>
				index.eq("workosConnectedAccountId", account.workosConnectedAccountId),
			)
			.unique();
	},
});

export const validateEmailInboxIntegrationReferences = migrations.define({
	table: "emailInboxes",
	migrateOne: async (ctx, inbox) => {
		if (!inbox.outbound) {
			return;
		}
		const integration = await ctx.db.get(
			"emailIntegrations",
			inbox.outbound.integrationId,
		);
		if (!integration) {
			throw new Error(`Email inbox ${inbox._id} has an orphaned integration`);
		}
		const account = await ctx.db.get(
			"connectedAccounts",
			integration.connectedAccountId,
		);
		if (!account || account.organizationId !== inbox.organizationId) {
			throw new Error(
				`Email inbox ${inbox._id} crosses an integration organization boundary`,
			);
		}
	},
});

export const validateEmailThreadIntegrationReferences = migrations.define({
	table: "emailThreadExternalReferences",
	migrateOne: async (ctx, reference) => {
		const [integration, inbox, thread] = await Promise.all([
			ctx.db.get("emailIntegrations", reference.integrationId),
			ctx.db.get("emailInboxes", reference.inboxId),
			ctx.db.get("emailThreads", reference.threadId),
		]);
		if (!integration || !inbox || !thread) {
			throw new Error(
				`Email thread reference ${reference._id} has an orphaned relation`,
			);
		}
		const account = await ctx.db.get(
			"connectedAccounts",
			integration.connectedAccountId,
		);
		if (
			!account ||
			account.organizationId !== inbox.organizationId ||
			account.organizationId !== thread.organizationId ||
			thread.inboxId !== inbox._id
		) {
			throw new Error(
				`Email thread reference ${reference._id} crosses an organization boundary`,
			);
		}
	},
});

export const validateEmailMessageIntegrationReferences = migrations.define({
	table: "emailMessages",
	migrateOne: async (ctx, message) => {
		const [integration, thread] = await Promise.all([
			ctx.db.get("emailIntegrations", message.integrationId),
			ctx.db.get("emailThreads", message.threadId),
		]);
		if (!integration || !thread) {
			throw new Error(`Email message ${message._id} has an orphaned relation`);
		}
		const account = await ctx.db.get(
			"connectedAccounts",
			integration.connectedAccountId,
		);
		if (!account || account.organizationId !== thread.organizationId) {
			throw new Error(
				`Email message ${message._id} crosses an integration organization boundary`,
			);
		}
	},
});

export const validateEmailIngestIntegrationReferences = migrations.define({
	table: "emailIngestEvents",
	migrateOne: async (ctx, event) => {
		const integration = await ctx.db.get(
			"emailIntegrations",
			event.integrationId,
		);
		if (!integration) {
			throw new Error(
				`Email ingest event ${event._id} has an orphaned integration`,
			);
		}
		const [account, inbox] = await Promise.all([
			ctx.db.get("connectedAccounts", integration.connectedAccountId),
			event.inboxId ? ctx.db.get("emailInboxes", event.inboxId) : null,
		]);
		if (
			!account ||
			(event.inboxId !== undefined &&
				(!inbox || inbox.organizationId !== account.organizationId))
		) {
			throw new Error(
				`Email ingest event ${event._id} crosses an integration organization boundary`,
			);
		}
	},
});

export const validateConnectedAccountSyncEventBackfill = migrations.define({
	table: "emailIntegrationSyncEvents",
	migrateOne: async (ctx, event) => {
		const migrated = await ctx.db
			.query("connectedAccountSyncEvents")
			.withIndex("by_source_and_source_event_id", (index) =>
				index
					.eq("source", event.source)
					.eq("sourceEventId", event.sourceEventId),
			)
			.unique();
		if (!migrated) {
			throw new Error(`Sync event ${event._id} was not backfilled`);
		}
	},
});

export const verifyConnectedAccountSplit = internalQuery({
	args: {},
	returns: v.object({
		complete: v.boolean(),
		invalidEmailIntegrationIds: v.array(v.id("emailIntegrations")),
		orphanedCleanupTaskIds: v.array(
			v.id("emailIntegrationWebhookCleanupTasks"),
		),
		unbackfilledSyncEventIds: v.array(v.id("emailIntegrationSyncEvents")),
	}),
	handler: async (ctx) => {
		const integrations = await ctx.db.query("emailIntegrations").take(100);
		const invalidIntegrations: Doc<"emailIntegrations">[] = [];
		for (const integration of integrations) {
			const account = await ctx.db.get(integration.connectedAccountId);
			if (!account) {
				invalidIntegrations.push(integration);
			}
		}
		const cleanupTasks = await ctx.db
			.query("emailIntegrationWebhookCleanupTasks")
			.take(100);
		const orphanedCleanupTasks: Doc<"emailIntegrationWebhookCleanupTasks">[] =
			[];
		for (const task of cleanupTasks) {
			if (!(await ctx.db.get(task.integrationId))) {
				orphanedCleanupTasks.push(task);
			}
		}
		const legacyEvents = await ctx.db
			.query("emailIntegrationSyncEvents")
			.take(100);
		const unbackfilledEvents: Doc<"emailIntegrationSyncEvents">[] = [];
		for (const event of legacyEvents) {
			const migrated = await ctx.db
				.query("connectedAccountSyncEvents")
				.withIndex("by_source_and_source_event_id", (index) =>
					index
						.eq("source", event.source)
						.eq("sourceEventId", event.sourceEventId),
				)
				.unique();
			if (!migrated) {
				unbackfilledEvents.push(event);
			}
		}
		return {
			complete:
				invalidIntegrations.length === 0 &&
				orphanedCleanupTasks.length === 0 &&
				unbackfilledEvents.length === 0,
			invalidEmailIntegrationIds: invalidIntegrations.map(
				(integration) => integration._id,
			),
			orphanedCleanupTaskIds: orphanedCleanupTasks.map((task) => task._id),
			unbackfilledSyncEventIds: unbackfilledEvents.map((event) => event._id),
		};
	},
});

export const runConnectedAccountSplitValidation = migrations.runner([
	internal.migrations.validateConnectedAccountSplit,
	internal.migrations.preflightConnectedAccountCleanupTasks,
	internal.migrations.validateEmailInboxIntegrationReferences,
	internal.migrations.validateEmailThreadIntegrationReferences,
	internal.migrations.validateEmailMessageIntegrationReferences,
	internal.migrations.validateEmailIngestIntegrationReferences,
	internal.migrations.validateConnectedAccountSyncEventBackfill,
]);
