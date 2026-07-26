import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

describe("contact reader", () => {
	it("lists only the organization's contacts by latest activity", async () => {
		const t = convexTest(schema, modules);
		const { newestContactId, otherContactId, threadId } = await t.run(
			async (ctx) => {
				const organizationId = await ctx.db.insert("organizations", {
					name: "Merimoar",
					slug: "merimoar",
				});
				const otherOrganizationId = await ctx.db.insert("organizations", {
					name: "Other",
					slug: "other",
				});
				await ctx.db.insert("contacts", {
					organizationId,
					address: "old@example.com",
					firstSeenAt: 1_000,
					lastSeenAt: 1_000,
				});
				const newestContactId = await ctx.db.insert("contacts", {
					organizationId,
					address: "new@example.com",
					name: "New Contact",
					firstSeenAt: 2_000,
					lastSeenAt: 3_000,
				});
				const otherContactId = await ctx.db.insert("contacts", {
					organizationId: otherOrganizationId,
					address: "other@example.com",
					firstSeenAt: 4_000,
					lastSeenAt: 4_000,
				});
				const connectionId = await ctx.db.insert("emailConnections", {
					organizationId,
					provider: "resend",
					displayName: "Support",
					address: "support@merimoar.test",
					status: "active",
				});
				const threadId = await ctx.db.insert("emailThreads", {
					connectionId,
					lastActivityAt: 3_000,
				});
				const messageId = await ctx.db.insert("emailMessages", {
					threadId,
					senderContactId: newestContactId,
					externalMessageId: "message-1",
					references: [],
					direction: "inbound",
					from: {
						name: "New Contact",
						address: "new@example.com",
					},
					to: [{ address: "support@merimoar.test" }],
					cc: [],
					bcc: [],
					replyTo: [],
					subject: "A question",
					textBody: "Could you help?",
					sentAt: 2_900,
					receivedAt: 3_000,
				});
				await ctx.db.patch(threadId, {
					latestMessageId: messageId,
				});
				return { newestContactId, otherContactId, threadId };
			},
		);

		const result = await t.query(api.contact.reader.list, {
			organizationSlug: "merimoar",
			paginationOpts: {
				numItems: 10,
				cursor: null,
			},
		});
		const inaccessibleContact = await t.query(api.contact.reader.get, {
			organizationSlug: "merimoar",
			contactId: otherContactId,
		});
		const messages = await t.query(api.contact.reader.listMessages, {
			organizationSlug: "merimoar",
			contactId: newestContactId,
			paginationOpts: {
				numItems: 10,
				cursor: null,
			},
		});

		expect(result.page.map((contact) => contact._id)).toEqual([
			newestContactId,
			expect.any(String),
		]);
		expect(inaccessibleContact).toBeNull();
		expect(messages.page).toHaveLength(1);
		expect(messages.page[0]).toMatchObject({
			message: {
				threadId,
				subject: "A question",
			},
			connection: {
				displayName: "Support",
				address: "support@merimoar.test",
			},
		});
	});

	it("returns null for a malformed contact ID", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert("organizations", {
				name: "Merimoar",
				slug: "merimoar",
			});
		});

		expect(
			await t.query(api.contact.reader.get, {
				organizationSlug: "merimoar",
				contactId: "not-a-contact-id",
			}),
		).toBeNull();
	});
});
