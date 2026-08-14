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
import { getEmailIntegrationAccessContext } from "#/integrations/connectedAccounts";
import { deriveEmailReadiness } from "#/integrations/model";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
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
const emailThreadViewValidator = v.union(
	v.literal("inbox"),
	v.literal("archive"),
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

async function requireOrganizationInboxId(
	ctx: QueryCtx,
	organizationId: Id<"organizations">,
	inboxId: string | undefined,
) {
	if (!inboxId) {
		return null;
	}

	const normalizedInboxId = ctx.db.normalizeId("emailInboxes", inboxId);
	const inbox = normalizedInboxId ? await ctx.db.get(normalizedInboxId) : null;
	if (!inbox || inbox.organizationId !== organizationId) {
		throw new ConvexError({
			code: "EMAIL_INBOX_NOT_FOUND",
			message: "The email inbox could not be found.",
		});
	}

	return inbox._id;
}

async function requireOrganizationEmailThread(
	ctx: QueryCtx | MutationCtx,
	organizationId: Id<"organizations">,
	threadId: Id<"emailThreads">,
) {
	const thread = await ctx.db.get(threadId);
	if (!thread || thread.organizationId !== organizationId) {
		throw new ConvexError({
			code: "EMAIL_THREAD_NOT_FOUND",
			message: "The email thread could not be found.",
		});
	}
	return thread;
}

async function includeLatestMessages(
	ctx: QueryCtx,
	threads: Doc<"emailThreads">[],
) {
	return await Promise.all(
		threads.map(async (thread) => ({
			thread,
			latestMessage: thread.latestMessageId
				? await ctx.db.get(thread.latestMessageId)
				: null,
		})),
	);
}

export const listOutboundIntegrations = query({
	args: {},
	handler: async (ctx) => {
		const workspace = await requireActor(ctx);
		const accounts = await ctx.db
			.query("connectedAccounts")
			.withIndex("by_organization_id_and_provider_slug", (index) =>
				index.eq("organizationId", workspace.organization._id),
			)
			.take(100);
		const integrations = await Promise.all(
			accounts.map(async (account) => {
				const integration = await ctx.db
					.query("emailIntegrations")
					.withIndex("by_connected_account_id", (index) =>
						index.eq("connectedAccountId", account._id),
					)
					.unique();
				if (!integration) {
					return null;
				}
				const readiness = deriveEmailReadiness(
					account.connectionStatus,
					account.grantedScopes,
					integration.resendWebhook !== undefined,
				);
				return {
					integrationId: integration._id,
					provider: "resend",
					connectionStatus: account.connectionStatus,
					outboundReadiness: readiness.outbound,
				};
			}),
		);
		return integrations.filter((integration) => integration !== null);
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
					? await getEmailIntegrationAccessContext(ctx, outbound.integrationId)
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
									integrationId: outboundIntegration.integrationId,
									provider: "resend",
									connectionStatus: outboundIntegration.connectionStatus,
									outboundReadiness: deriveEmailReadiness(
										outboundIntegration.connectionStatus,
										outboundIntegration.grantedScopes,
										outboundIntegration.resendWebhook !== undefined,
									).outbound,
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
		view: emailThreadViewValidator,
	},
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		const inboxId = await requireOrganizationInboxId(
			ctx,
			workspace.organization._id,
			args.inboxId,
		);

		const result = inboxId
			? await ctx.db
					.query("emailThreads")
					.withIndex("by_org_inbox_archive_activity", (query) => {
						const inboxThreads = query
							.eq("organizationId", workspace.organization._id)
							.eq("inboxId", inboxId);
						return args.view === "archive"
							? inboxThreads.gt("archivedAt", 0)
							: inboxThreads.eq("archivedAt", undefined);
					})
					.order("desc")
					.paginate(args.paginationOpts)
			: await ctx.db
					.query("emailThreads")
					.withIndex("by_org_archive_activity", (query) => {
						const organizationThreads = query.eq(
							"organizationId",
							workspace.organization._id,
						);
						return args.view === "archive"
							? organizationThreads.gt("archivedAt", 0)
							: organizationThreads.eq("archivedAt", undefined);
					})
					.order("desc")
					.paginate(args.paginationOpts);

		const page = await includeLatestMessages(ctx, result.page);

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
		const thread = await requireOrganizationEmailThread(
			ctx,
			workspace.organization._id,
			args.threadId,
		);
		if (thread.archivedAt !== undefined) {
			throw new ConvexError({
				code: "EMAIL_THREAD_ARCHIVED",
				message: "The archived email thread cannot be marked as unread.",
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

export const setThreadArchived = mutation({
	args: {
		threadId: v.id("emailThreads"),
		archived: v.boolean(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		const thread = await requireOrganizationEmailThread(
			ctx,
			workspace.organization._id,
			args.threadId,
		);
		if ((thread.archivedAt !== undefined) === args.archived) {
			return null;
		}

		await requireHumanEmailThreadWriteAccess(
			ctx,
			workspace.organization._id,
			thread._id,
		);
		if (args.archived) {
			await setThreadUnread(ctx, thread, false);
		}
		await ctx.db.patch(thread._id, {
			archivedAt: args.archived ? Date.now() : undefined,
		});
		return null;
	},
});
