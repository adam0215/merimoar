import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const firstEmail = {
	externalMessageId: "resend-message-1",
	internetMessageId: "<first@example.com>",
	references: [],
	from: { name: "Ada", address: "ada@example.com" },
	to: [{ address: "inbox@merimoar.test" }],
	cc: [],
	bcc: [],
	replyTo: [],
	subject: "Policy review",
	textBody: "Could you review this policy?",
	sentAt: 1_000,
	receivedAt: 1_100,
};

describe("inbound email ingestion", () => {
	it("keeps replies in one thread and handles duplicate provider messages", async () => {
		const t = convexTest(schema, modules);
		const { connectionId, firstEventId } = await t.run(async (ctx) => {
			const organizationId = await ctx.db.insert("organizations", {
				name: "Merimoar",
				slug: "merimoar",
			});
			const connectionId = await ctx.db.insert("emailConnections", {
				organizationId,
				provider: "resend",
				displayName: "Support",
				address: "inbox@merimoar.test",
				status: "active",
			});
			const firstEventId = await ctx.db.insert("emailIngestEvents", {
				connectionId,
				externalEventId: "event-1",
				externalMessageId: firstEmail.externalMessageId,
				eventType: "email.received",
				status: "pending",
				rawPayload: "{}",
				receivedAt: 1_100,
				attempts: 0,
			});
			return { connectionId, firstEventId };
		});

		const firstMessageId = await t.mutation(
			internal.email.ingest.storeInboundEmail,
			{
				eventId: firstEventId,
				email: firstEmail,
			},
		);

		const secondEventId = await t.run(async (ctx) =>
			ctx.db.insert("emailIngestEvents", {
				connectionId,
				externalEventId: "event-2",
				externalMessageId: "resend-message-2",
				eventType: "email.received",
				status: "pending",
				rawPayload: "{}",
				receivedAt: 2_100,
				attempts: 0,
			}),
		);
		const secondMessageId = await t.mutation(
			internal.email.ingest.storeInboundEmail,
			{
				eventId: secondEventId,
				email: {
					...firstEmail,
					externalMessageId: "resend-message-2",
					internetMessageId: "<second@example.com>",
					inReplyTo: "<first@example.com>",
					references: ["<first@example.com>"],
					subject: "Re: Policy review",
					textBody: "Absolutely.",
					sentAt: 2_000,
					receivedAt: 2_100,
				},
			},
		);

		const duplicateEventId = await t.run(async (ctx) =>
			ctx.db.insert("emailIngestEvents", {
				connectionId,
				externalEventId: "event-3",
				externalMessageId: "resend-message-2",
				eventType: "email.received",
				status: "pending",
				rawPayload: "{}",
				receivedAt: 2_200,
				attempts: 0,
			}),
		);
		const duplicateMessageId = await t.mutation(
			internal.email.ingest.storeInboundEmail,
			{
				eventId: duplicateEventId,
				email: {
					...firstEmail,
					externalMessageId: "resend-message-2",
					internetMessageId: "<second@example.com>",
					inReplyTo: "<first@example.com>",
					references: ["<first@example.com>"],
					receivedAt: 2_100,
				},
			},
		);

		const state = await t.run(async (ctx) => ({
			threads: await ctx.db.query("emailThreads").collect(),
			messages: await ctx.db.query("emailMessages").collect(),
			duplicateEvent: await ctx.db.get(duplicateEventId),
		}));

		expect(firstMessageId).not.toBeNull();
		expect(secondMessageId).not.toBe(firstMessageId);
		expect(duplicateMessageId).toBe(secondMessageId);
		expect(state.threads).toHaveLength(1);
		expect(state.messages).toHaveLength(2);
		expect(state.threads[0]?.latestMessageId).toBe(secondMessageId);
		expect(state.duplicateEvent?.status).toBe("processed");
	});

	it("uses a provider thread ID before RFC reply headers when available", async () => {
		const t = convexTest(schema, modules);
		const { connectionId, eventIds } = await t.run(async (ctx) => {
			const organizationId = await ctx.db.insert("organizations", {
				name: "Merimoar",
				slug: "merimoar",
			});
			const connectionId = await ctx.db.insert("emailConnections", {
				organizationId,
				provider: "future-provider",
				displayName: "Operations",
				address: "operations@merimoar.test",
				status: "active",
			});
			const eventIds = await Promise.all(
				["provider-event-1", "provider-event-2"].map(
					(externalEventId, index) =>
						ctx.db.insert("emailIngestEvents", {
							connectionId,
							externalEventId,
							externalMessageId: `provider-message-${index + 1}`,
							eventType: "email.received",
							status: "pending",
							rawPayload: "{}",
							receivedAt: 3_000 + index,
							attempts: 0,
						}),
				),
			);
			return { connectionId, eventIds };
		});

		for (const [index, eventId] of eventIds.entries()) {
			await t.mutation(internal.email.ingest.storeInboundEmail, {
				eventId,
				email: {
					...firstEmail,
					externalMessageId: `provider-message-${index + 1}`,
					externalThreadId: "provider-thread-1",
					internetMessageId: `<unrelated-${index + 1}@example.com>`,
					references: [],
					receivedAt: 3_000 + index,
				},
			});
		}

		const threads = await t.run(async (ctx) =>
			ctx.db
				.query("emailThreads")
				.withIndex(
					"by_connection_id_and_external_thread_id",
					(query) =>
						query
							.eq("connectionId", connectionId)
							.eq(
								"externalThreadId",
								"provider-thread-1",
							),
				)
				.collect(),
		);

		expect(threads).toHaveLength(1);
	});
});
