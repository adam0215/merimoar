import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { createTest, syncWorkosUser } from "../test.setup";

// TEST FIXTURES: The Merimoar organization, people, emails, and WorkOS-style
// identifiers below exist only in convex-test's isolated in-memory database.
const ISSUER = "https://api.workos.com/";

describe("contact reader", () => {
	it("lists only the organization's contacts by latest activity", async () => {
		const base = createTest();
		await Promise.all([
			syncWorkosUser(base, {
				id: "user_adam",
				name: "Adam",
				email: "adam@merimoar.com",
			}),
			syncWorkosUser(base, {
				id: "user_other",
				name: "Other",
				email: "other@example.com",
			}),
		]);
		const { newestContactId, otherContactId, relatedCaseId, threadId } =
			await base.run(async (ctx) => {
				const organizationId = await ctx.db.insert("organizations", {
					name: "Merimoar",
					workosOrganizationId: "org_merimoar",
					active: true,
				});
				const otherOrganizationId = await ctx.db.insert("organizations", {
					name: "Other",
					workosOrganizationId: "org_other",
					active: true,
				});
				await ctx.db.insert("organizationMembers", {
					organizationId,
					workosUserId: "user_adam",
					active: true,
				});
				await ctx.db.insert("organizationMembers", {
					organizationId: otherOrganizationId,
					workosUserId: "user_other",
					active: true,
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
				const inboxId = await ctx.db.insert("emailInboxes", {
					organizationId,
					displayName: "Support",
					address: "support@merimoar.test",
					status: "active",
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
				const threadId = await ctx.db.insert("emailThreads", {
					organizationId,
					inboxId,
					lastActivityAt: 3_000,
				});
				const messageId = await ctx.db.insert("emailMessages", {
					inboxId,
					integrationId,
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
				const relatedCaseId = await ctx.db.insert("cases", {
					organizationId,
					reference: "CASE-1",
					title: "Related case",
					description: "",
					ownerMemberId: null,
					dueAt: null,
					status: "open",
					lastActivityAt: 3_000,
					createdAt: 2_000,
					updatedAt: 3_000,
				});
				const removedCaseId = await ctx.db.insert("cases", {
					organizationId,
					reference: "CASE-2",
					title: "Removed case",
					description: "",
					ownerMemberId: null,
					dueAt: null,
					status: "closed",
					lastActivityAt: 2_000,
					createdAt: 1_000,
					updatedAt: 2_000,
				});
				await ctx.db.insert("caseContactRelations", {
					caseId: relatedCaseId,
					contactId: newestContactId,
					startedAt: 2_000,
					endedAt: null,
					addedByMemberId: null,
					removedByMemberId: null,
				});
				await ctx.db.insert("caseContactRelations", {
					caseId: removedCaseId,
					contactId: newestContactId,
					startedAt: 1_000,
					endedAt: 2_000,
					addedByMemberId: null,
					removedByMemberId: null,
				});
				return {
					newestContactId,
					otherContactId,
					relatedCaseId,
					threadId,
				};
			});
		const actor = base.withIdentity({
			issuer: ISSUER,
			subject: "user_adam",
			org_id: "org_merimoar",
		});

		const result = await actor.query(api.contact.reader.list, {
			paginationOpts: {
				numItems: 10,
				cursor: null,
			},
		});
		const inaccessibleContact = await actor.query(api.contact.reader.get, {
			contactId: otherContactId,
		});
		const messages = await actor.query(api.contact.reader.listMessages, {
			contactId: newestContactId,
			paginationOpts: {
				numItems: 10,
				cursor: null,
			},
		});
		const relatedCases = await actor.query(api.contact.reader.listCases, {
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
			inbox: {
				displayName: "Support",
				address: "support@merimoar.test",
			},
		});
		expect(relatedCases.page.map((caseRecord) => caseRecord._id)).toEqual([
			relatedCaseId,
		]);
		await expect(
			actor.query(api.contact.reader.listCases, {
				contactId: otherContactId,
				paginationOpts: {
					numItems: 10,
					cursor: null,
				},
			}),
		).rejects.toThrow("Contact not found");
	});

	it("returns null for a malformed contact ID", async () => {
		const base = createTest();
		await syncWorkosUser(base, {
			id: "user_adam",
			name: "Adam",
			email: "adam@merimoar.com",
		});
		await base.run(async (ctx) => {
			const organizationId = await ctx.db.insert("organizations", {
				name: "Merimoar",
				workosOrganizationId: "org_merimoar",
				active: true,
			});
			await ctx.db.insert("organizationMembers", {
				organizationId,
				workosUserId: "user_adam",
				active: true,
			});
		});
		const actor = base.withIdentity({
			issuer: ISSUER,
			subject: "user_adam",
			org_id: "org_merimoar",
		});

		expect(
			await actor.query(api.contact.reader.get, {
				contactId: "not-a-contact-id",
			}),
		).toBeNull();
		await expect(
			base.query(api.contact.reader.list, {
				paginationOpts: { numItems: 10, cursor: null },
			}),
		).rejects.toThrow("Sign in");
	});
});
