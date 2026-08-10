import { ConvexError, type Infer, v } from "convex/values";
import { requireAgentRuntimeSecret } from "#/agent/access";
import { requireBuiltInToolActive } from "#/agent/builtInTools";
import {
	commitMutatingToolResult,
	requireApprovedToolExecution,
	requireCompletedToolOutput,
	requireMutatingToolLedger,
	requireRunOrganization,
} from "#/agent/toolLedger";
import {
	emailSearchResultValidator,
	invalidPersistedAgentData,
	readEmailThreadResultValidator,
	summarizeText,
	validateEmailMessageLinks,
} from "#/agent/toolReadModel";
import { requireAgentTaskCaseWriteAccess } from "#/case/access";
import { getActiveCaseRelationForEmailThread } from "#/case/emailRelations";
import { queueEmailReply } from "#/email/outbound";
import { mutation } from "../../_generated/server";
import { invalidAgentTool, mutatingRuntimeArgs, runtimeArgs } from "./shared";

const MAX_EMAIL_SEARCH_THREADS = 50;
const MAX_EMAIL_SEARCH_RESULTS = 20;
const MAX_EMAIL_SEARCH_MESSAGES_PER_THREAD = 20;
const MAX_EMAIL_MESSAGES_PER_THREAD = 100;
const sendEmailResultValidator = v.object({
	status: v.literal("queued_successfully"),
	messageId: v.id("emailMessages"),
	sendId: v.id("emailSends"),
	deduplicated: v.boolean(),
});
type SendEmailResult = Infer<typeof sendEmailResultValidator>;

export function createEmailTools() {
	const searchEmails = mutation({
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

	const readEmailThread = mutation({
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

	const sendEmail = mutation({
		args: {
			...mutatingRuntimeArgs,
			threadId: v.id("emailThreads"),
			body: v.string(),
		},
		returns: sendEmailResultValidator,
		handler: async (ctx, args) => {
			requireAgentRuntimeSecret(args.runtimeSecret);
			const runtime = await requireMutatingToolLedger(ctx, args, "send_email");
			if (runtime.item.status === "completed") {
				const persisted = JSON.parse(
					requireCompletedToolOutput(runtime.item),
				) as SendEmailResult;
				const result = {
					...persisted,
					deduplicated: true,
				};
				await commitMutatingToolResult(ctx, runtime.item, result);
				return result;
			}

			const sourceTool = await requireApprovedToolExecution(ctx, {
				task: runtime.task,
				runId: runtime.run._id,
				toolCallId: args.toolCallId,
				toolName: "send_email",
			});
			await requireBuiltInToolActive(ctx, runtime.organizationId, "send_email");
			await requireAgentTaskCaseWriteAccess(
				ctx,
				runtime.anchorCase._id,
				runtime.task._id,
			);

			const thread = await ctx.db.get(args.threadId);
			if (!thread || thread.organizationId !== runtime.organizationId) {
				throw invalidAgentTool("The email thread could not be found.");
			}
			const activeRelation = await getActiveCaseRelationForEmailThread(
				ctx,
				thread._id,
			);
			if (activeRelation?.caseId !== runtime.anchorCase._id) {
				throw invalidAgentTool(
					"The email thread is not actively related to the delegated case.",
				);
			}

			const latestInbound = await ctx.db
				.query("emailMessages")
				.withIndex("by_thread_id_and_direction_and_sent_at", (index) =>
					index.eq("threadId", thread._id).eq("direction", "inbound"),
				)
				.order("desc")
				.first();
			if (latestInbound && latestInbound._creationTime > sourceTool.createdAt) {
				throw new ConvexError({
					code: "EMAIL_THREAD_CHANGED",
					message:
						"A new email arrived in the thread. Read it before proposing another reply.",
				});
			}

			const queued = await queueEmailReply(ctx, {
				thread,
				body: args.body,
				actor: { kind: "agent", taskId: runtime.task._id },
			});
			const result = {
				status: "queued_successfully" as const,
				...queued,
				deduplicated: false,
			};
			await commitMutatingToolResult(ctx, runtime.item, result);
			return result;
		},
	});

	return { searchEmails, readEmailThread, sendEmail };
}
