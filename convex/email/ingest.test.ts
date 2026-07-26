import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

// TEST FIXTURES: These hardcoded organizations, messages, and reserved example
// addresses exist only in convex-test's isolated in-memory database.
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
			contacts: await ctx.db.query("contacts").collect(),
			duplicateEvent: await ctx.db.get(duplicateEventId),
		}));

		expect(firstMessageId).not.toBeNull();
		expect(secondMessageId).not.toBe(firstMessageId);
		expect(duplicateMessageId).toBe(secondMessageId);
		expect(state.threads).toHaveLength(1);
		expect(state.messages).toHaveLength(2);
		expect(state.contacts).toHaveLength(1);
		expect(state.contacts[0]).toMatchObject({
			address: "ada@example.com",
			name: "Ada",
			firstSeenAt: 1_100,
			lastSeenAt: 2_100,
		});
		expect(
			state.messages.every(
				(message) => message.senderContactId === state.contacts[0]?._id,
			),
		).toBe(true);
		expect(state.threads[0]?.latestMessageId).toBe(secondMessageId);
		expect(state.duplicateEvent?.status).toBe("processed");
	});

	it("deduplicates a provider message within its connection without a cross-inbox scan limit", async () => {
		const t = convexTest(schema, modules);
		const { eventId, existingMessageId } = await t.run(async (ctx) => {
			const organizationId = await ctx.db.insert("organizations", {
				name: "Merimoar",
				slug: "merimoar",
			});
			const senderContactId = await ctx.db.insert("contacts", {
				organizationId,
				address: firstEmail.from.address,
				name: firstEmail.from.name,
				firstSeenAt: firstEmail.receivedAt,
				lastSeenAt: firstEmail.receivedAt,
			});

			let lastConnectionId: Id<"emailConnections"> | undefined;
			let existingMessageId: Id<"emailMessages"> | undefined;

			for (let index = 0; index < 21; index += 1) {
				const connectionId = await ctx.db.insert("emailConnections", {
					organizationId,
					provider: "resend",
					displayName: `Inbox ${index}`,
					address: `inbox-${index}@merimoar.test`,
					status: "active",
				});
				const threadId = await ctx.db.insert("emailThreads", {
					connectionId,
					lastActivityAt: firstEmail.receivedAt,
				});
				const messageId = await ctx.db.insert("emailMessages", {
					connectionId,
					threadId,
					senderContactId,
					...firstEmail,
					direction: "inbound",
				});
				await ctx.db.patch(threadId, { latestMessageId: messageId });
				lastConnectionId = connectionId;
				existingMessageId = messageId;
			}

			if (!lastConnectionId || !existingMessageId) {
				throw new Error("Expected an inbox fixture");
			}
			const eventId = await ctx.db.insert("emailIngestEvents", {
				connectionId: lastConnectionId,
				externalEventId: "duplicate-event",
				externalMessageId: firstEmail.externalMessageId,
				eventType: "email.received",
				status: "pending",
				rawPayload: "{}",
				receivedAt: firstEmail.receivedAt,
				attempts: 0,
			});
			return { eventId, existingMessageId };
		});

		expect(
			await t.mutation(internal.email.ingest.storeInboundEmail, {
				eventId,
				email: firstEmail,
			}),
		).toBe(existingMessageId);
		expect(
			await t.run(async (ctx) => ctx.db.query("emailMessages").collect()),
		).toHaveLength(21);
	});

	it("normalizes contacts per organization and preserves the newest observed name", async () => {
		const t = convexTest(schema, modules);
		const setup = await t.run(async (ctx) => {
			const firstOrganizationId = await ctx.db.insert("organizations", {
				name: "Merimoar",
				slug: "merimoar",
			});
			const secondOrganizationId = await ctx.db.insert("organizations", {
				name: "Other",
				slug: "other",
			});
			const firstConnectionId = await ctx.db.insert("emailConnections", {
				organizationId: firstOrganizationId,
				provider: "resend",
				displayName: "Support",
				address: "support@merimoar.test",
				status: "active",
			});
			const secondConnectionId = await ctx.db.insert("emailConnections", {
				organizationId: firstOrganizationId,
				provider: "resend",
				displayName: "Sales",
				address: "sales@merimoar.test",
				status: "active",
			});
			const otherConnectionId = await ctx.db.insert("emailConnections", {
				organizationId: secondOrganizationId,
				provider: "resend",
				displayName: "Other",
				address: "inbox@other.test",
				status: "active",
			});

			const eventIds = await Promise.all(
				[
					{
						connectionId: firstConnectionId,
						externalEventId: "contact-event-new",
						externalMessageId: "contact-message-new",
						receivedAt: 3_000,
					},
					{
						connectionId: secondConnectionId,
						externalEventId: "contact-event-old",
						externalMessageId: "contact-message-old",
						receivedAt: 1_000,
					},
					{
						connectionId: otherConnectionId,
						externalEventId: "contact-event-other",
						externalMessageId: "contact-message-other",
						receivedAt: 2_000,
					},
				].map((event) =>
					ctx.db.insert("emailIngestEvents", {
						...event,
						eventType: "email.received",
						status: "pending",
						rawPayload: "{}",
						attempts: 0,
					}),
				),
			);

			return {
				firstOrganizationId,
				secondOrganizationId,
				eventIds,
			};
		});

		const emails = [
			{
				...firstEmail,
				externalMessageId: "contact-message-new",
				internetMessageId: "<contact-new@example.com>",
				from: { name: "Ada New", address: " ADA@EXAMPLE.COM " },
				receivedAt: 3_000,
			},
			{
				...firstEmail,
				externalMessageId: "contact-message-old",
				internetMessageId: "<contact-old@example.com>",
				from: { name: "Ada Old", address: "ada@example.com" },
				receivedAt: 1_000,
			},
			{
				...firstEmail,
				externalMessageId: "contact-message-other",
				internetMessageId: "<contact-other@example.com>",
				from: { name: "Ada Other", address: "ada@example.com" },
				receivedAt: 2_000,
			},
		];

		for (const [index, eventId] of setup.eventIds.entries()) {
			const email = emails[index];
			if (!email) {
				throw new Error("Missing test email");
			}
			await t.mutation(internal.email.ingest.storeInboundEmail, {
				eventId,
				email,
			});
		}

		const contacts = await t.run(async (ctx) =>
			ctx.db.query("contacts").collect(),
		);
		const merimoarContact = contacts.find(
			(contact) => contact.organizationId === setup.firstOrganizationId,
		);
		const otherContact = contacts.find(
			(contact) => contact.organizationId === setup.secondOrganizationId,
		);

		expect(contacts).toHaveLength(2);
		expect(merimoarContact).toMatchObject({
			address: "ada@example.com",
			name: "Ada New",
			firstSeenAt: 1_000,
			lastSeenAt: 3_000,
		});
		expect(otherContact).toMatchObject({
			address: "ada@example.com",
			name: "Ada Other",
			firstSeenAt: 2_000,
			lastSeenAt: 2_000,
		});
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
				["provider-event-1", "provider-event-2"].map((externalEventId, index) =>
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
				.withIndex("by_connection_id_and_external_thread_id", (query) =>
					query
						.eq("connectionId", connectionId)
						.eq("externalThreadId", "provider-thread-1"),
				)
				.collect(),
		);

		expect(threads).toHaveLength(1);
	});
});
