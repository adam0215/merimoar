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
		const { inboxId, integrationId, firstEventId } = await t.run(
			async (ctx) => {
				const organizationId = await ctx.db.insert("organizations", {
					name: "Merimoar",
					workosOrganizationId: "org_merimoar",
					active: true,
				});
				const integrationId = await ctx.db.insert("emailIntegrations", {
					organizationId,
					provider: "resend",
					status: "connected",
					workosOrganizationId: "org_merimoar",
					workosUserId: "user_adam",
					workosDataIntegrationId: "data_integration_resend",
					workosConnectedAccountId: "connected_account_resend",
					workosConnectedAccountUpdatedAt: 1_000,
				});
				const inboxId = await ctx.db.insert("emailInboxes", {
					organizationId,
					displayName: "Support",
					address: "inbox@merimoar.test",
					status: "active",
					unreadThreadCount: 0,
				});
				const firstEventId = await ctx.db.insert("emailIngestEvents", {
					inboxId,
					integrationId,
					externalEventId: "event-1",
					externalMessageId: firstEmail.externalMessageId,
					eventType: "email.received",
					status: "queued",
					rawPayload: "{}",
					receivedAt: 1_100,
					attempts: 0,
					replayCount: 0,
					processingGeneration: 0,
				});
				return { inboxId, integrationId, firstEventId };
			},
		);

		const firstMessageId = await t.mutation(
			internal.email.ingest.storeInboundEmail,
			{
				eventId: firstEventId,
				processingGeneration: 0,
				email: firstEmail,
			},
		);
		await t.run(async (ctx) => {
			if (!firstMessageId) {
				throw new Error("Expected the first email to be stored");
			}
			const firstMessage = await ctx.db.get(firstMessageId);
			if (!firstMessage) {
				throw new Error("Expected the first email to exist");
			}
			await ctx.db.patch(firstMessage.threadId, { isUnread: false });
			await ctx.db.patch(inboxId, { unreadThreadCount: 0 });
		});

		const secondEventId = await t.run(async (ctx) =>
			ctx.db.insert("emailIngestEvents", {
				inboxId,
				integrationId,
				externalEventId: "event-2",
				externalMessageId: "resend-message-2",
				eventType: "email.received",
				status: "queued",
				rawPayload: "{}",
				receivedAt: 2_100,
				attempts: 0,
				replayCount: 0,
				processingGeneration: 0,
			}),
		);
		const secondMessageId = await t.mutation(
			internal.email.ingest.storeInboundEmail,
			{
				eventId: secondEventId,
				processingGeneration: 0,
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
				inboxId,
				integrationId,
				externalEventId: "event-3",
				externalMessageId: "resend-message-2",
				eventType: "email.received",
				status: "queued",
				rawPayload: "{}",
				receivedAt: 2_200,
				attempts: 0,
				replayCount: 0,
				processingGeneration: 0,
			}),
		);
		const duplicateMessageId = await t.mutation(
			internal.email.ingest.storeInboundEmail,
			{
				eventId: duplicateEventId,
				processingGeneration: 0,
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
			inbox: await ctx.db.get(inboxId),
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
				(message) =>
					message.direction === "inbound" &&
					message.senderContactId === state.contacts[0]?._id,
			),
		).toBe(true);
		expect(state.threads[0]?.latestMessageId).toBe(secondMessageId);
		expect(state.threads[0]?.isUnread).toBe(true);
		expect(state.inbox?.unreadThreadCount).toBe(1);
		expect(state.duplicateEvent?.status).toBe("processed");
	});

	it("deduplicates a provider message within its inbox without a cross-inbox scan limit", async () => {
		const t = convexTest(schema, modules);
		const { eventId, existingMessageId } = await t.run(async (ctx) => {
			const organizationId = await ctx.db.insert("organizations", {
				name: "Merimoar",
				workosOrganizationId: "org_merimoar",
				active: true,
			});
			const integrationId = await ctx.db.insert("emailIntegrations", {
				organizationId,
				provider: "resend",
				status: "connected",
				workosOrganizationId: "org_merimoar",
				workosUserId: "user_adam",
				workosDataIntegrationId: "data_integration_resend",
				workosConnectedAccountId: "connected_account_resend",
				workosConnectedAccountUpdatedAt: 1_000,
			});
			const senderContactId = await ctx.db.insert("contacts", {
				organizationId,
				address: firstEmail.from.address,
				name: firstEmail.from.name,
				firstSeenAt: firstEmail.receivedAt,
				lastSeenAt: firstEmail.receivedAt,
			});

			let lastInboxId: Id<"emailInboxes"> | undefined;
			let existingMessageId: Id<"emailMessages"> | undefined;

			for (let index = 0; index < 21; index += 1) {
				const inboxId = await ctx.db.insert("emailInboxes", {
					organizationId,
					displayName: `Inbox ${index}`,
					address: `inbox-${index}@merimoar.test`,
					status: "active",
					unreadThreadCount: 0,
				});
				const threadId = await ctx.db.insert("emailThreads", {
					organizationId,
					inboxId,
					lastActivityAt: firstEmail.receivedAt,
				});
				const messageId = await ctx.db.insert("emailMessages", {
					inboxId,
					integrationId,
					threadId,
					senderContactId,
					...firstEmail,
					direction: "inbound",
				});
				await ctx.db.patch(threadId, { latestMessageId: messageId });
				lastInboxId = inboxId;
				existingMessageId = messageId;
			}

			if (!lastInboxId || !existingMessageId) {
				throw new Error("Expected an inbox fixture");
			}
			const eventId = await ctx.db.insert("emailIngestEvents", {
				inboxId: lastInboxId,
				integrationId,
				externalEventId: "duplicate-event",
				externalMessageId: firstEmail.externalMessageId,
				eventType: "email.received",
				status: "queued",
				rawPayload: "{}",
				receivedAt: firstEmail.receivedAt,
				attempts: 0,
				replayCount: 0,
				processingGeneration: 0,
			});
			return { eventId, existingMessageId };
		});

		expect(
			await t.mutation(internal.email.ingest.storeInboundEmail, {
				eventId,
				processingGeneration: 0,
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
				workosOrganizationId: "org_merimoar",
				active: true,
			});
			const secondOrganizationId = await ctx.db.insert("organizations", {
				name: "Other",
				workosOrganizationId: "org_other",
				active: true,
			});
			const firstIntegrationId = await ctx.db.insert("emailIntegrations", {
				organizationId: firstOrganizationId,
				provider: "resend",
				status: "connected",
				workosOrganizationId: "org_merimoar",
				workosUserId: "user_adam",
				workosDataIntegrationId: "data_integration_resend",
				workosConnectedAccountId: "connected_account_resend",
				workosConnectedAccountUpdatedAt: 1_000,
			});
			const secondIntegrationId = await ctx.db.insert("emailIntegrations", {
				organizationId: secondOrganizationId,
				provider: "resend",
				status: "connected",
				workosOrganizationId: "org_other",
				workosUserId: "user_other",
				workosDataIntegrationId: "data_integration_other",
				workosConnectedAccountId: "connected_account_other",
				workosConnectedAccountUpdatedAt: 1_000,
			});
			const firstInboxId = await ctx.db.insert("emailInboxes", {
				organizationId: firstOrganizationId,
				displayName: "Support",
				address: "support@merimoar.test",
				status: "active",
				unreadThreadCount: 0,
			});
			const secondInboxId = await ctx.db.insert("emailInboxes", {
				organizationId: firstOrganizationId,
				displayName: "Sales",
				address: "sales@merimoar.test",
				status: "active",
				unreadThreadCount: 0,
			});
			const otherInboxId = await ctx.db.insert("emailInboxes", {
				organizationId: secondOrganizationId,
				displayName: "Other",
				address: "inbox@other.test",
				status: "active",
				unreadThreadCount: 0,
			});

			const eventIds = await Promise.all(
				[
					{
						inboxId: firstInboxId,
						integrationId: firstIntegrationId,
						externalEventId: "contact-event-new",
						externalMessageId: "contact-message-new",
						receivedAt: 3_000,
					},
					{
						inboxId: secondInboxId,
						integrationId: firstIntegrationId,
						externalEventId: "contact-event-old",
						externalMessageId: "contact-message-old",
						receivedAt: 1_000,
					},
					{
						inboxId: otherInboxId,
						integrationId: secondIntegrationId,
						externalEventId: "contact-event-other",
						externalMessageId: "contact-message-other",
						receivedAt: 2_000,
					},
				].map((event) =>
					ctx.db.insert("emailIngestEvents", {
						...event,
						eventType: "email.received",
						status: "queued",
						rawPayload: "{}",
						attempts: 0,
						replayCount: 0,
						processingGeneration: 0,
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
				processingGeneration: 0,
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

	it("scopes provider thread IDs to their integration before RFC reply headers", async () => {
		const t = convexTest(schema, modules);
		const { eventIds } = await t.run(async (ctx) => {
			const organizationId = await ctx.db.insert("organizations", {
				name: "Merimoar",
				workosOrganizationId: "org_merimoar",
				active: true,
			});
			const integrationId = await ctx.db.insert("emailIntegrations", {
				organizationId,
				provider: "resend",
				status: "connected",
				workosOrganizationId: "org_merimoar",
				workosUserId: "user_adam",
				workosDataIntegrationId: "data_integration_resend",
				workosConnectedAccountId: "connected_account_resend",
				workosConnectedAccountUpdatedAt: 1_000,
			});
			const secondIntegrationId = await ctx.db.insert("emailIntegrations", {
				organizationId,
				provider: "resend",
				status: "connected",
				workosOrganizationId: "org_merimoar",
				workosUserId: "user_alex",
				workosDataIntegrationId: "data_integration_resend_second",
				workosConnectedAccountId: "connected_account_resend_second",
				workosConnectedAccountUpdatedAt: 1_000,
			});
			const inboxId = await ctx.db.insert("emailInboxes", {
				organizationId,
				displayName: "Operations",
				address: "operations@merimoar.test",
				status: "active",
				unreadThreadCount: 0,
			});
			const eventIds = await Promise.all(
				[
					{ externalEventId: "provider-event-1", integrationId },
					{ externalEventId: "provider-event-2", integrationId },
					{
						externalEventId: "provider-event-3",
						integrationId: secondIntegrationId,
					},
				].map((event, index) =>
					ctx.db.insert("emailIngestEvents", {
						inboxId,
						...event,
						externalMessageId: `provider-message-${index + 1}`,
						eventType: "email.received",
						status: "queued",
						rawPayload: "{}",
						receivedAt: 3_000 + index,
						attempts: 0,
						replayCount: 0,
						processingGeneration: 0,
					}),
				),
			);
			return { eventIds };
		});

		for (const [index, eventId] of eventIds.entries()) {
			await t.mutation(internal.email.ingest.storeInboundEmail, {
				eventId,
				processingGeneration: 0,
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

		const state = await t.run(async (ctx) => {
			return {
				references: await ctx.db
					.query("emailThreadExternalReferences")
					.collect(),
				threads: await ctx.db.query("emailThreads").collect(),
			};
		});

		expect(state.references).toHaveLength(2);
		expect(state.threads).toHaveLength(2);
	});
});
