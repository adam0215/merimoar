import { getActiveCaseRelationForEmailThread } from "#/case/emailRelations";
import { removeCaseEmbedding } from "#/case/embeddingData";
import { buildCaseEmbeddingInput } from "#/case/embeddingModel";
import {
	appendInboundEmailCaseEvent,
	appendSystemChangeCaseEvent,
} from "#/case/events";
import { CASE_STATUS_LABELS, type CaseStatus } from "#/case/model";
import { setThreadUnread } from "#/email/unreadCounts";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export type DomainEventMap = {
	"email.messageReceived": {
		messageId: Id<"emailMessages">;
		threadId: Id<"emailThreads">;
		receivedAt: number;
	};
	"case.emailReceived": {
		caseId: Id<"cases">;
		messageId: Id<"emailMessages">;
		threadId: Id<"emailThreads">;
		receivedAt: number;
	};
	"case.statusChanged": {
		caseId: Id<"cases">;
		status: CaseStatus;
		changedByMemberId: Id<"organizationMembers"> | null;
		occurredAt: number;
	};
	"case.detailsChanged": {
		caseId: Id<"cases">;
		previous: {
			title: string;
			description: string;
		};
	};
};

export type DomainEvent = {
	[Name in keyof DomainEventMap]: {
		name: Name;
		payload: DomainEventMap[Name];
	};
}[keyof DomainEventMap];

export async function dispatchDomainEvent(
	ctx: MutationCtx,
	event: DomainEvent,
): Promise<void> {
	switch (event.name) {
		case "email.messageReceived":
			await handleEmailMessageReceived(ctx, event.payload);
			return;
		case "case.emailReceived":
			await handleCaseEmailReceived(ctx, event.payload);
			return;
		case "case.statusChanged":
			await handleCaseStatusChanged(ctx, event.payload);
			return;
		case "case.detailsChanged":
			await handleCaseDetailsChanged(ctx, event.payload);
			return;
		default:
			assertNever(event);
	}
}

async function handleEmailMessageReceived(
	ctx: MutationCtx,
	event: DomainEventMap["email.messageReceived"],
) {
	const [message, thread] = await Promise.all([
		ctx.db.get(event.messageId),
		ctx.db.get(event.threadId),
	]);
	if (!message) throw new Error("Received email message not found");
	if (message.direction !== "inbound")
		throw new Error("Received email message is not inbound");
	if (message.threadId !== event.threadId)
		throw new Error("Received email message belongs to another thread");
	if (!thread) throw new Error("Received email thread not found");

	await setThreadUnread(ctx, thread, true);

	const activeCaseRelation = await getActiveCaseRelationForEmailThread(
		ctx,
		thread._id,
	);
	if (!activeCaseRelation) return;

	await dispatchDomainEvent(ctx, {
		name: "case.emailReceived",
		payload: {
			caseId: activeCaseRelation.caseId,
			messageId: message._id,
			threadId: thread._id,
			receivedAt: event.receivedAt,
		},
	});
}

async function handleCaseEmailReceived(
	ctx: MutationCtx,
	event: DomainEventMap["case.emailReceived"],
) {
	const [caseRecord, thread] = await Promise.all([
		ctx.db.get(event.caseId),
		ctx.db.get(event.threadId),
	]);
	if (!caseRecord) throw new Error("Case linked to received email not found");
	if (!thread) throw new Error("Email thread linked to case not found");
	if (caseRecord.organizationId !== thread.organizationId)
		throw new Error("Email thread has an invalid active case relation");

	await appendInboundEmailCaseEvent(
		ctx,
		caseRecord,
		event.messageId,
		event.receivedAt,
	);
	if (caseRecord.status === "needs_attention") return;

	await ctx.db.patch(caseRecord._id, { status: "needs_attention" });
	await dispatchDomainEvent(ctx, {
		name: "case.statusChanged",
		payload: {
			caseId: caseRecord._id,
			status: "needs_attention",
			changedByMemberId: null,
			occurredAt: event.receivedAt,
		},
	});
}

async function handleCaseStatusChanged(
	ctx: MutationCtx,
	event: DomainEventMap["case.statusChanged"],
) {
	const caseRecord = await ctx.db.get(event.caseId);
	if (!caseRecord) throw new Error("Case with changed status not found");
	if (caseRecord.status !== event.status)
		throw new Error("Changed case status does not match persisted status");
	if (event.changedByMemberId === null) return;

	await appendSystemChangeCaseEvent(
		ctx,
		caseRecord,
		`Case status changed to ${CASE_STATUS_LABELS[event.status]}.`,
		event.changedByMemberId,
		event.occurredAt,
	);
}

async function handleCaseDetailsChanged(
	ctx: MutationCtx,
	event: DomainEventMap["case.detailsChanged"],
) {
	const caseRecord = await ctx.db.get(event.caseId);
	if (!caseRecord) throw new Error("Case with changed details not found");

	const previousEmbeddingInput = buildCaseEmbeddingInput(
		event.previous.title,
		event.previous.description,
	);
	const currentEmbeddingInput = buildCaseEmbeddingInput(
		caseRecord.title,
		caseRecord.description,
	);
	if (previousEmbeddingInput === currentEmbeddingInput) return;

	await removeCaseEmbedding(ctx, caseRecord._id);
	await ctx.scheduler.runAfter(0, internal.case.embedding.embedCase, {
		caseId: caseRecord._id,
	});
}

function assertNever(value: never): never {
	throw new Error(`Unhandled domain event: ${JSON.stringify(value)}`);
}
