import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { emailParticipantValidator } from "./email/model";

export default defineSchema({
	organizations: defineTable({
		name: v.string(),
		slug: v.string(),
	}).index("by_slug", ["slug"]),

	emailConnections: defineTable({
		organizationId: v.id("organizations"),
		provider: v.string(),
		displayName: v.string(),
		address: v.string(),
		status: v.union(v.literal("active"), v.literal("disabled")),
	})
		.index("by_organization_id", ["organizationId"])
		.index("by_address", ["address"]),

	emailThreads: defineTable({
		connectionId: v.id("emailConnections"),
		externalThreadId: v.optional(v.string()),
		latestMessageId: v.optional(v.id("emailMessages")),
		lastActivityAt: v.number(),
	})
		.index("by_connection_id_and_external_thread_id", [
			"connectionId",
			"externalThreadId",
		])
		.index("by_connection_id_and_last_activity_at", [
			"connectionId",
			"lastActivityAt",
		]),

	contacts: defineTable({
		organizationId: v.id("organizations"),
		address: v.string(),
		name: v.optional(v.string()),
		firstSeenAt: v.number(),
		lastSeenAt: v.number(),
	})
		.index("by_organization_id_and_address", [
			"organizationId",
			"address",
		])
		.index("by_organization_id_and_last_seen_at", [
			"organizationId",
			"lastSeenAt",
		]),

	emailMessages: defineTable({
		threadId: v.id("emailThreads"),
		senderContactId: v.id("contacts"),
		externalMessageId: v.string(),
		internetMessageId: v.optional(v.string()),
		inReplyTo: v.optional(v.string()),
		references: v.array(v.string()),
		direction: v.literal("inbound"),
		from: emailParticipantValidator,
		to: v.array(emailParticipantValidator),
		cc: v.array(emailParticipantValidator),
		bcc: v.array(emailParticipantValidator),
		replyTo: v.array(emailParticipantValidator),
		subject: v.string(),
		textBody: v.string(),
		sentAt: v.number(),
		receivedAt: v.number(),
	})
		.index("by_thread_id_and_received_at", ["threadId", "receivedAt"])
		.index("by_sender_contact_id_and_received_at", [
			"senderContactId",
			"receivedAt",
		])
		.index("by_external_message_id", ["externalMessageId"])
		.index("by_internet_message_id", ["internetMessageId"]),

	emailIngestEvents: defineTable({
		connectionId: v.optional(v.id("emailConnections")),
		externalEventId: v.string(),
		externalMessageId: v.string(),
		eventType: v.string(),
		status: v.union(
			v.literal("pending"),
			v.literal("processed"),
			v.literal("failed"),
			v.literal("ignored"),
		),
		rawPayload: v.any(),
		receivedAt: v.number(),
		processedAt: v.optional(v.number()),
		error: v.optional(v.string()),
		attempts: v.number(),
	})
		.index("by_external_event_id", ["externalEventId"])
		.index("by_connection_id_and_external_message_id", [
			"connectionId",
			"externalMessageId",
		]),
});
