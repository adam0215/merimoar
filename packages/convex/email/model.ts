import type { Infer } from "convex/values";
import { v } from "convex/values";

export const emailParticipantValidator = v.object({
	address: v.string(),
	name: v.optional(v.string()),
});

const emailMessageBaseValidator = v.object({
	inboxId: v.id("emailInboxes"),
	integrationId: v.id("emailIntegrations"),
	threadId: v.id("emailThreads"),
	internetMessageId: v.optional(v.string()),
	inReplyTo: v.optional(v.string()),
	references: v.array(v.string()),
	from: emailParticipantValidator,
	to: v.array(emailParticipantValidator),
	cc: v.array(emailParticipantValidator),
	bcc: v.array(emailParticipantValidator),
	replyTo: v.array(emailParticipantValidator),
	subject: v.string(),
	textBody: v.string(),
	sentAt: v.number(),
});

export const emailMessageValidator = v.union(
	emailMessageBaseValidator.extend({
		direction: v.literal("inbound"),
		senderContactId: v.id("contacts"),
		externalMessageId: v.string(),
		receivedAt: v.number(),
	}),
	emailMessageBaseValidator.extend({
		direction: v.literal("outbound"),
		authoredByMemberId: v.id("organizationMembers"),
		externalMessageId: v.optional(v.string()),
	}),
);

export const emailSendFailureValidator = v.union(
	v.object({
		kind: v.literal("before_provider"),
		reason: v.union(
			v.literal("work_canceled"),
			v.literal("route_inactive"),
			v.literal("access_unavailable"),
			v.literal("configuration"),
			v.literal("worker_failed"),
		),
		message: v.string(),
	}),
	v.object({
		kind: v.literal("provider_rejected"),
		reason: v.union(
			v.literal("authorization"),
			v.literal("configuration"),
			v.literal("transient"),
		),
		message: v.string(),
	}),
	v.object({
		kind: v.literal("permanent"),
		message: v.string(),
	}),
	v.object({
		kind: v.literal("ambiguous"),
		message: v.string(),
	}),
);

export const emailSendStatusValidator = v.union(
	v.literal("queued"),
	v.literal("sending"),
	v.literal("sent"),
	v.literal("failed"),
);

export const normalizedInboundEmailValidator = v.object({
	externalMessageId: v.string(),
	externalThreadId: v.optional(v.string()),
	internetMessageId: v.optional(v.string()),
	inReplyTo: v.optional(v.string()),
	references: v.array(v.string()),
	from: emailParticipantValidator,
	to: v.array(emailParticipantValidator),
	cc: v.array(emailParticipantValidator),
	bcc: v.array(emailParticipantValidator),
	replyTo: v.array(emailParticipantValidator),
	subject: v.string(),
	textBody: v.string(),
	sentAt: v.number(),
	receivedAt: v.number(),
});

export const emailIngestStatusValidator = v.union(
	v.literal("unroutable"),
	v.literal("queued"),
	v.literal("processed"),
	v.literal("failed"),
);

export const emailIngestFailureKindValidator = v.union(
	v.literal("unroutable"),
	v.literal("provider"),
	v.literal("configuration"),
	v.literal("route_inactive"),
	v.literal("unknown"),
);

export type EmailParticipant = Infer<typeof emailParticipantValidator>;
export type EmailSendFailure = Infer<typeof emailSendFailureValidator>;
export const ambiguousProviderOutcomeFailure = {
	kind: "ambiguous",
	message: "The provider outcome is unknown; the email will not be sent again.",
} as const satisfies EmailSendFailure;
export type NormalizedInboundEmail = Infer<
	typeof normalizedInboundEmailValidator
>;
