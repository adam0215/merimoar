import { Migrations } from "@convex-dev/migrations";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";

const migrations = new Migrations<DataModel>(components.migrations);

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
			if (integration.status !== "connected") {
				return;
			}
			await ctx.scheduler.runAfter(
				0,
				internal.email.integrationActions.reconcileResendWebhook,
				{
					integrationId: integration._id,
					expectedConnectedAccountUpdatedAt:
						integration.workosConnectedAccountUpdatedAt,
					attempt: 0,
				},
			);
		},
	});
