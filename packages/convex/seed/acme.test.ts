import { describe, expect, it } from "vitest";
import { ACME_INBOX, ACME_SUGGESTION_EMAILS } from "#/seed/acmeData";
import { createTest } from "#/test.setup";
import { internal } from "../_generated/api";

describe("Acme AB seed data", () => {
	it("creates idempotent unlinked email threads for suggestion testing", async () => {
		const test = createTest();
		const organizationId = await test.run(async (ctx) => {
			const organizationId = await ctx.db.insert("organizations", {
				name: "Test organization",
				workosOrganizationId: "org_suggestion_seed",
				active: true,
			});
			await ctx.db.insert("organizationMembers", {
				organizationId,
				workosUserId: "user_suggestion_seed_owner",
				active: true,
			});
			return organizationId;
		});

		const firstRun = await test.mutation(
			internal.seed.acme.seedSuggestionEmails,
			{
				organizationId,
				confirmation: "seed-suggestion-emails",
			},
		);
		expect(firstRun).toMatchObject({
			createdThreads: ACME_SUGGESTION_EMAILS.length,
			existingThreads: 0,
		});
		await test.run(async (ctx) => {
			for await (const message of ctx.db.query("emailMessages")) {
				await ctx.db.patch(message._id, {
					subject: `Testförslag: ${message.subject}`,
				});
			}
		});
		const secondRun = await test.mutation(
			internal.seed.acme.seedSuggestionEmails,
			{
				organizationId,
				confirmation: "seed-suggestion-emails",
			},
		);
		expect(secondRun).toMatchObject({
			createdThreads: 0,
			existingThreads: ACME_SUGGESTION_EMAILS.length,
			inboxId: firstRun.inboxId,
		});

		const state = await test.run(async (ctx) => {
			const references = (
				await ctx.db.query("emailThreadExternalReferences").collect()
			).filter((reference) =>
				reference.externalThreadId.startsWith("seed-suggestion-"),
			);
			const threadIds = new Set(
				references.map((reference) => reference.threadId),
			);
			return {
				references,
				messages: (await ctx.db.query("emailMessages").collect()).filter(
					(message) => threadIds.has(message.threadId),
				),
				relations: (
					await ctx.db.query("caseEmailThreadRelations").collect()
				).filter((relation) => threadIds.has(relation.threadId)),
				inbox: await ctx.db.get(firstRun.inboxId),
			};
		});

		expect(state.references).toHaveLength(ACME_SUGGESTION_EMAILS.length);
		expect(state.messages).toHaveLength(5);
		expect(
			state.messages.every(
				(message) =>
					message.direction === "inbound" &&
					!message.subject.includes("Testförslag:"),
			),
		).toBe(true);
		expect(state.relations).toEqual([]);
		expect(state.inbox).toMatchObject({
			unreadThreadCount: ACME_SUGGESTION_EMAILS.length,
		});
	});

	it("creates a coherent, idempotent demo inbox without an outbound route", async () => {
		const test = createTest();
		const organizationId = await test.run(async (ctx) => {
			const organizationId = await ctx.db.insert("organizations", {
				name: "Test organization",
				workosOrganizationId: "org_test",
				active: true,
			});
			await ctx.db.insert("organizationMembers", {
				organizationId,
				workosUserId: "user_seed_owner",
				active: true,
			});
			return organizationId;
		});

		const firstRun = await test.mutation(internal.seed.acme.seed, {
			organizationId,
			confirmation: "seed-acme-ab",
		});
		const secondRun = await test.mutation(internal.seed.acme.seed, {
			organizationId,
			confirmation: "seed-acme-ab",
		});

		expect(firstRun).toMatchObject({
			createdCases: 15,
			existingCases: 0,
			createdThreads: 15,
		});
		expect(secondRun).toMatchObject({
			createdCases: 0,
			existingCases: 15,
			createdThreads: 0,
			inboxId: firstRun.inboxId,
		});

		const state = await test.run(async (ctx) => ({
			cases: await ctx.db.query("cases").collect(),
			contacts: await ctx.db.query("contacts").collect(),
			threads: await ctx.db.query("emailThreads").collect(),
			messages: await ctx.db.query("emailMessages").collect(),
			sends: await ctx.db.query("emailSends").collect(),
			inbox: await ctx.db.get(firstRun.inboxId),
			caseContactRelations: await ctx.db
				.query("caseContactRelations")
				.collect(),
			caseEmailThreadRelations: await ctx.db
				.query("caseEmailThreadRelations")
				.collect(),
		}));

		expect(state.cases).toHaveLength(15);
		expect(state.contacts).toHaveLength(13);
		expect(state.threads).toHaveLength(15);
		expect(state.messages).toHaveLength(30);
		expect(state.sends).toHaveLength(12);
		expect(state.caseContactRelations).toHaveLength(15);
		expect(state.caseEmailThreadRelations).toHaveLength(15);
		expect(state.inbox).toMatchObject({
			displayName: ACME_INBOX.displayName,
			address: ACME_INBOX.address,
			status: "active",
			unreadThreadCount: 6,
		});
		expect(state.inbox?.outbound).toBeUndefined();
		expect(
			state.contacts.every((contact) => contact.address.endsWith(".invalid")),
		).toBe(true);
	});

	it("moves and renames the complete seed graph between organizations", async () => {
		const test = createTest();
		const { sourceOrganizationId, targetOrganizationId, targetMemberId } =
			await test.run(async (ctx) => {
				const sourceOrganizationId = await ctx.db.insert("organizations", {
					name: "Merimoar",
					workosOrganizationId: "org_source",
					active: true,
				});
				const targetOrganizationId = await ctx.db.insert("organizations", {
					name: "Acme AB",
					workosOrganizationId: "org_acme",
					active: true,
				});
				await ctx.db.insert("organizationMembers", {
					organizationId: sourceOrganizationId,
					workosUserId: "user_shared",
					active: true,
				});
				const targetMemberId = await ctx.db.insert("organizationMembers", {
					organizationId: targetOrganizationId,
					workosUserId: "user_shared",
					active: true,
				});
				await ctx.db.insert("cases", {
					organizationId: sourceOrganizationId,
					reference: "CASE-UNRELATED",
					title: "Unrelated source case",
					description: "This must remain in the source organization.",
					ownerMemberId: null,
					dueAt: null,
					status: "open",
					lastActivityAt: 1,
					createdAt: 1,
					updatedAt: 1,
				});
				return {
					sourceOrganizationId,
					targetOrganizationId,
					targetMemberId,
				};
			});
		const seeded = await test.mutation(internal.seed.acme.seed, {
			organizationId: sourceOrganizationId,
			confirmation: "seed-acme-ab",
		});
		await test.run(async (ctx) => {
			await ctx.db.patch(seeded.inboxId, {
				displayName: "Sundhamn Energi — seeddata",
				address: "kundservice@seed.sundhamn-energi.invalid",
			});
			const messages = await ctx.db.query("emailMessages").collect();
			for (const message of messages) {
				const makeLegacy = (value: string) =>
					value
						.replaceAll("Acme AB", "Sundhamn Energi")
						.replaceAll("seed.acme.invalid", "seed.sundhamn-energi.invalid");
				const participant = (value: { address: string; name?: string }) => ({
					address: makeLegacy(value.address),
					...(value.name ? { name: makeLegacy(value.name) } : undefined),
				});
				await ctx.db.patch(message._id, {
					internetMessageId: message.internetMessageId
						? makeLegacy(message.internetMessageId)
						: undefined,
					inReplyTo: message.inReplyTo
						? makeLegacy(message.inReplyTo)
						: undefined,
					references: message.references.map(makeLegacy),
					from: participant(message.from),
					to: message.to.map(participant),
					cc: message.cc.map(participant),
					bcc: message.bcc.map(participant),
					replyTo: message.replyTo.map(participant),
					subject: makeLegacy(message.subject),
					textBody: makeLegacy(message.textBody),
				});
			}
		});

		const result = await test.mutation(internal.seed.acmeMigration.moveToAcme, {
			sourceWorkosOrganizationId: "org_source",
			targetWorkosOrganizationId: "org_acme",
			confirmation: "move-seed-data-to-acme-ab",
		});
		const inspection = await test.query(
			internal.seed.acmeMigration.inspectMove,
			{
				sourceWorkosOrganizationId: "org_source",
				targetWorkosOrganizationId: "org_acme",
			},
		);
		const secondMove = await test.mutation(
			internal.seed.acmeMigration.moveToAcme,
			{
				sourceWorkosOrganizationId: "org_source",
				targetWorkosOrganizationId: "org_acme",
				confirmation: "move-seed-data-to-acme-ab",
			},
		);

		expect(result).toMatchObject({
			alreadyMoved: false,
			movedCases: 15,
			movedContacts: 13,
			movedThreads: 15,
			movedMessages: 30,
			movedSends: 12,
			movedEvents: 45,
			inboxId: seeded.inboxId,
		});
		expect(inspection).toEqual({
			sourceOrganizationFound: true,
			targetOrganizationFound: true,
			sourceCases: 0,
			targetCases: 15,
			sourceInboxFound: false,
			targetInboxFound: true,
			targetThreads: 15,
			targetMessages: 30,
			legacyMessageFields: 0,
		});
		expect(secondMove).toMatchObject({
			alreadyMoved: true,
			movedCases: 0,
			movedContacts: 0,
			movedThreads: 0,
			movedMessages: 0,
		});

		const state = await test.run(async (ctx) => ({
			sourceCases: await ctx.db
				.query("cases")
				.withIndex("by_organization_id_and_last_activity_at", (index) =>
					index.eq("organizationId", sourceOrganizationId),
				)
				.collect(),
			targetCases: await ctx.db
				.query("cases")
				.withIndex("by_organization_id_and_last_activity_at", (index) =>
					index.eq("organizationId", targetOrganizationId),
				)
				.collect(),
			targetContacts: await ctx.db
				.query("contacts")
				.withIndex("by_organization_id_and_last_seen_at", (index) =>
					index.eq("organizationId", targetOrganizationId),
				)
				.collect(),
			targetThreads: await ctx.db
				.query("emailThreads")
				.withIndex("by_organization_id_and_last_activity_at", (index) =>
					index.eq("organizationId", targetOrganizationId),
				)
				.collect(),
			inbox: await ctx.db.get(seeded.inboxId),
			events: await ctx.db.query("caseEvents").collect(),
			sends: await ctx.db.query("emailSends").collect(),
		}));
		expect(state.sourceCases).toMatchObject([{ reference: "CASE-UNRELATED" }]);
		expect(state.targetCases).toHaveLength(15);
		expect(
			state.targetCases.every(
				(caseRecord) => caseRecord.ownerMemberId === targetMemberId,
			),
		).toBe(true);
		expect(state.targetContacts).toHaveLength(13);
		expect(state.targetThreads).toHaveLength(15);
		expect(state.inbox).toMatchObject({
			organizationId: targetOrganizationId,
			displayName: ACME_INBOX.displayName,
			address: ACME_INBOX.address,
		});
		expect(
			state.events.every(
				(event) =>
					event.createdByMemberId === null ||
					event.createdByMemberId === targetMemberId,
			),
		).toBe(true);
		expect(
			state.sends.every((send) => send.requestedByMemberId === targetMemberId),
		).toBe(true);
	});
});
