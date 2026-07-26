import type { Infer } from "convex/values";
import { v } from "convex/values";

export const emailParticipantValidator = v.object({
	address: v.string(),
	name: v.optional(v.string()),
});

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

export type EmailParticipant = Infer<typeof emailParticipantValidator>;
export type NormalizedInboundEmail = Infer<
	typeof normalizedInboundEmailValidator
>;
