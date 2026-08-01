import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { requireActor } from "#/auth/access";
import { requireHumanEmailThreadWriteAccess } from "#/case/access";
import {
	activeAgentTaskSummaryValidator,
	getActiveAgentTaskSummaryForCase,
} from "#/case/agentOwnership";
import { getActiveCaseRelationForEmailThread } from "#/case/emailRelations";
import {
	emailMessageDocumentValidator,
	emailSendFailureValidator,
	emailSendStatusValidator,
} from "#/email/model";
import { setThreadUnread } from "#/email/unreadCounts";
import type { Id, TableNames } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import schema from "../schema";

function systemFields<TableName extends TableNames>(tableName: TableName) {
	return { _id: v.id(tableName), _creationTime: v.number() };
}

const emailThreadDocumentValidator =
	schema.tables.emailThreads.validator.extend(systemFields("emailThreads"));
const emailInboxDocumentValidator = schema.tables.emailInboxes.validator.extend(
	systemFields("emailInboxes"),
);
const emailDraftDocumentValidator = schema.tables.emailDrafts.validator.extend(
	systemFields("emailDrafts"),
);
const caseDocumentValidator = schema.tables.cases.validator.extend(
	systemFields("cases"),
);

async function listLatestThreadMessages(
	ctx: QueryCtx,
	threadId: Id<"emailThreads">,
) {
	const messages = await ctx.db
		.query("emailMessages")
		.withIndex("by_thread_id_and_sent_at", (query) =>
			query.eq("threadId", threadId),
		)
		.order("desc")
		.take(100);
	return messages.reverse();
}

export const listOutboundIntegrations = query({
	args: {},
	handler: async (ctx) => {
		const workspace = await requireActor(ctx);
		const integrations = await ctx.db
			.query("emailIntegrations")
			.withIndex("by_organization_id_and_provider", (index) =>
				index.eq("organizationId", workspace.organization._id),
			)
			.take(100);
		return integrations.map((integration) => ({
			integrationId: integration._id,
			provider: integration.provider,
			status: integration.status,
		}));
	},
});

export const listInboxes = query({
	args: {},
	handler: async (ctx) => {
		const workspace = await requireActor(ctx);
		const inboxes = await ctx.db
			.query("emailInboxes")
			.withIndex("by_organization_id_and_status", (query) =>
				query
					.eq("organizationId", workspace.organization._id)
					.eq("status", "active"),
			)
			.take(100);
		return await Promise.all(
			inboxes.map(async (inbox) => {
				const outbound = inbox.outbound;
				const outboundIntegration = outbound
					? await ctx.db.get(outbound.integrationId)
					: null;
				return {
					_id: inbox._id,
					_creationTime: inbox._creationTime,
					displayName: inbox.displayName,
					address: inbox.address,
					status: "active" as const,
					unreadCount: inbox.unreadThreadCount,
					outboundIntegration:
						outboundIntegration?.organizationId ===
							workspace.organization._id && outbound
							? {
									integrationId: outboundIntegration._id,
									provider: outboundIntegration.provider,
									status: outboundIntegration.status,
									address: outbound.address,
								}
							: null,
				};
			}),
		);
	},
});

export const listThreads = query({
	args: {
		paginationOpts: paginationOptsValidator,
		inboxId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		let inboxId = args.inboxId
			? ctx.db.normalizeId("emailInboxes", args.inboxId)
			: null;
		if (args.inboxId) {
			const inbox = inboxId ? await ctx.db.get(inboxId) : null;
			if (!inbox || inbox.organizationId !== workspace.organization._id) {
				throw new ConvexError({
					code: "EMAIL_INBOX_NOT_FOUND",
					message: "The email inbox could not be found.",
				});
			}
			inboxId = inbox._id;
		}

		const result = inboxId
			? await ctx.db
					.query("emailThreads")
					.withIndex(
						"by_organization_id_and_inbox_id_and_last_activity_at",
						(query) =>
							query
								.eq("organizationId", workspace.organization._id)
								.eq("inboxId", inboxId),
					)
					.order("desc")
					.paginate(args.paginationOpts)
			: await ctx.db
					.query("emailThreads")
					.withIndex("by_organization_id_and_last_activity_at", (query) =>
						query.eq("organizationId", workspace.organization._id),
					)
					.order("desc")
					.paginate(args.paginationOpts);

		const page = await Promise.all(
			result.page.map(async (thread) => ({
				thread,
				latestMessage: thread.latestMessageId
					? await ctx.db.get(thread.latestMessageId)
					: null,
			})),
		);

		return {
			...result,
			page,
		};
	},
});

export const getThread = query({
	args: {
		threadId: v.string(),
	},
	returns: v.union(
		v.object({
			thread: emailThreadDocumentValidator,
			inbox: emailInboxDocumentValidator,
			messages: v.array(emailMessageDocumentValidator),
			sendStatuses: v.array(
				v.object({
					messageId: v.id("emailMessages"),
					status: emailSendStatusValidator,
					failure: v.optional(emailSendFailureValidator),
				}),
			),
			draft: v.union(emailDraftDocumentValidator, v.null()),
			activeCase: v.union(
				caseDocumentValidator.extend({
					relationId: v.id("caseEmailThreadRelations"),
					activeAgentTask: v.union(activeAgentTaskSummaryValidator, v.null()),
				}),
				v.null(),
			),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		const threadId = ctx.db.normalizeId("emailThreads", args.threadId);
		if (!threadId) {
			return null;
		}
		const thread = await ctx.db.get(threadId);
		if (!thread || thread.organizationId !== workspace.organization._id) {
			return null;
		}

		const [inbox, messages, activeCaseRelation, draft] = await Promise.all([
			ctx.db.get(thread.inboxId),
			listLatestThreadMessages(ctx, thread._id),
			getActiveCaseRelationForEmailThread(ctx, thread._id),
			ctx.db
				.query("emailDrafts")
				.withIndex("by_thread_id_and_author_member_id", (index) =>
					index
						.eq("threadId", thread._id)
						.eq("authorMemberId", workspace.member._id),
				)
				.unique(),
		]);

		if (!inbox) {
			return null;
		}
		const activeCase = activeCaseRelation
			? await ctx.db.get(activeCaseRelation.caseId)
			: null;
		const visibleActiveCase =
			activeCaseRelation &&
			activeCase?.organizationId === workspace.organization._id
				? { caseRecord: activeCase, relationId: activeCaseRelation._id }
				: null;
		const [activeAgentTask, sendStatuses] = await Promise.all([
			visibleActiveCase
				? getActiveAgentTaskSummaryForCase(
						ctx,
						visibleActiveCase.caseRecord._id,
						workspace.organization._id,
					)
				: null,
			Promise.all(
				messages.flatMap((message) =>
					message.direction === "outbound"
						? [
								ctx.db
									.query("emailSends")
									.withIndex("by_message_id", (index) =>
										index.eq("messageId", message._id),
									)
									.unique()
									.then((send) => {
										if (!send) {
											throw new Error(
												"Outbound email message is missing send state",
											);
										}
										return {
											messageId: message._id,
											status: send.status,
											failure: send.failure,
										};
									}),
							]
						: [],
				),
			),
		]);

		return {
			thread,
			inbox,
			messages,
			sendStatuses,
			draft,
			activeCase: visibleActiveCase
				? {
						...visibleActiveCase.caseRecord,
						relationId: visibleActiveCase.relationId,
						activeAgentTask,
					}
				: null,
		};
	},
});

export const setUnread = mutation({
	args: {
		threadId: v.id("emailThreads"),
		isUnread: v.boolean(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		const thread = await ctx.db.get(args.threadId);
		if (!thread || thread.organizationId !== workspace.organization._id) {
			throw new ConvexError({
				code: "EMAIL_THREAD_NOT_FOUND",
				message: "The email thread could not be found.",
			});
		}

		if (thread.isUnread === args.isUnread) {
			return null;
		}

		await requireHumanEmailThreadWriteAccess(
			ctx,
			workspace.organization._id,
			thread._id,
		);
		await setThreadUnread(ctx, thread, args.isUnread);
		return null;
	},
});
