import { describe, expect, it } from "vitest";
import { createTest, insertResendIntegration } from "#/test.setup";
import { internal } from "./_generated/api";

async function createRepairFixture(replacementOrganization: "same" | "other") {
	const test = createTest();
	const ids = await test.run(async (ctx) => {
		const organizationId = await ctx.db.insert("organizations", {
			name: "Email owner",
			workosOrganizationId: "org_email_owner",
			referenceSlug: "OWNER",
			active: true,
		});
		const otherOrganizationId = await ctx.db.insert("organizations", {
			name: "Other organization",
			workosOrganizationId: "org_other",
			referenceSlug: "OTHER",
			active: true,
		});
		const orphaned = await insertResendIntegration(ctx, organizationId, {
			suffix: "orphaned",
		});
		const replacement = await insertResendIntegration(
			ctx,
			replacementOrganization === "same" ? organizationId : otherOrganizationId,
			{ suffix: "replacement" },
		);
		const inboxId = await ctx.db.insert("emailInboxes", {
			organizationId,
			displayName: "Support",
			address: "support@example.com",
			status: "active",
			unreadThreadCount: 0,
		});
		const threadId = await ctx.db.insert("emailThreads", {
			organizationId,
			inboxId,
			lastActivityAt: 100,
			isUnread: false,
		});
		const senderContactId = await ctx.db.insert("contacts", {
			organizationId,
			address: "sender@example.com",
			firstSeenAt: 100,
			lastSeenAt: 100,
		});
		const messageId = await ctx.db.insert("emailMessages", {
			threadId,
			inboxId,
			integrationId: orphaned.integrationId,
			direction: "inbound",
			senderContactId,
			from: { address: "sender@example.com" },
			to: [{ address: "support@example.com" }],
			cc: [],
			bcc: [],
			replyTo: [],
			subject: "Orphaned integration",
			textBody: "Test message",
			sentAt: 100,
			receivedAt: 100,
			externalMessageId: "external_message",
			internetMessageId: "<external_message@example.com>",
			references: [],
		});
		const threadReferenceId = await ctx.db.insert(
			"emailThreadExternalReferences",
			{
				threadId,
				inboxId,
				integrationId: orphaned.integrationId,
				externalThreadId: "external_thread",
			},
		);

		await ctx.db.patch(threadId, { latestMessageId: messageId });
		await ctx.db.delete(orphaned.integrationId);

		return {
			organizationId,
			orphanedIntegrationId: orphaned.integrationId,
			replacementIntegrationId: replacement.integrationId,
			messageId,
			threadReferenceId,
		};
	});

	return { ids, test };
}

describe("orphaned email integration reference repair", () => {
	it("moves messages and thread references to a replacement in the same organization", async () => {
		const { ids, test } = await createRepairFixture("same");

		await expect(
			test.mutation(
				internal.migrations.repairOrphanedEmailIntegrationReferences,
				{
					organizationId: ids.organizationId,
					orphanedIntegrationId: ids.orphanedIntegrationId,
					replacementIntegrationId: ids.replacementIntegrationId,
					expectedMessageCount: 1,
					expectedThreadReferenceCount: 1,
					dryRun: true,
				},
			),
		).resolves.toEqual({ messageCount: 1, threadReferenceCount: 1 });
		expect(
			await test.run(async (ctx) => ctx.db.get(ids.messageId)),
		).toMatchObject({ integrationId: ids.orphanedIntegrationId });

		await expect(
			test.mutation(
				internal.migrations.repairOrphanedEmailIntegrationReferences,
				{
					organizationId: ids.organizationId,
					orphanedIntegrationId: ids.orphanedIntegrationId,
					replacementIntegrationId: ids.replacementIntegrationId,
					expectedMessageCount: 1,
					expectedThreadReferenceCount: 1,
					dryRun: false,
				},
			),
		).resolves.toEqual({ messageCount: 1, threadReferenceCount: 1 });

		const repaired = await test.run(async (ctx) => ({
			message: await ctx.db.get(ids.messageId),
			threadReference: await ctx.db.get(ids.threadReferenceId),
		}));
		expect(repaired.message?.integrationId).toBe(ids.replacementIntegrationId);
		expect(repaired.threadReference?.integrationId).toBe(
			ids.replacementIntegrationId,
		);
	});

	it("rejects a replacement owned by another organization", async () => {
		const { ids, test } = await createRepairFixture("other");

		await expect(
			test.mutation(
				internal.migrations.repairOrphanedEmailIntegrationReferences,
				{
					organizationId: ids.organizationId,
					orphanedIntegrationId: ids.orphanedIntegrationId,
					replacementIntegrationId: ids.replacementIntegrationId,
					expectedMessageCount: 1,
					expectedThreadReferenceCount: 1,
					dryRun: false,
				},
			),
		).rejects.toThrow(
			"Replacement integration belongs to another organization",
		);

		const message = await test.run(async (ctx) => ctx.db.get(ids.messageId));
		expect(message?.integrationId).toBe(ids.orphanedIntegrationId);
	});
});
