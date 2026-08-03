import { describe, expect, it } from "vitest";
import { createTest, syncWorkosUser } from "#/test.setup";
import { api } from "../_generated/api";

// TEST FIXTURES: The Merimoar organization, people, emails, and WorkOS-style
// identifiers below exist only in convex-test's isolated in-memory database.
const ISSUER = "https://api.workos.com/";

describe("email reader authorization", () => {
	it("lists every workspace thread across inboxes and excludes other organizations", async () => {
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
		const {
			firstInboxId,
			otherInboxId,
			secondInboxId,
			firstThreadId,
			secondThreadId,
			otherThreadId,
		} = await base.run(async (ctx) => {
			const organizationId = await ctx.db.insert("organizations", {
				name: "Merimoar",
				workosOrganizationId: "org_merimoar",
				referenceSlug: "MER",
				active: true,
			});
			const otherOrganizationId = await ctx.db.insert("organizations", {
				name: "Other",
				workosOrganizationId: "org_other",
				referenceSlug: "OTHR",
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
			const firstInboxId = await ctx.db.insert("emailInboxes", {
				organizationId,
				displayName: "Support",
				address: "support@merimoar.test",
				status: "active",
				unreadThreadCount: 1,
			});
			const secondInboxId = await ctx.db.insert("emailInboxes", {
				organizationId,
				displayName: "Operations",
				address: "operations@merimoar.test",
				status: "active",
				unreadThreadCount: 0,
			});
			const otherInboxId = await ctx.db.insert("emailInboxes", {
				organizationId: otherOrganizationId,
				displayName: "Other",
				address: "inbox@other.test",
				status: "active",
				unreadThreadCount: 1,
			});
			const firstThreadId = await ctx.db.insert("emailThreads", {
				organizationId,
				inboxId: firstInboxId,
				lastActivityAt: 1_000,
				isUnread: true,
			});
			const secondThreadId = await ctx.db.insert("emailThreads", {
				organizationId,
				inboxId: secondInboxId,
				lastActivityAt: 3_000,
				isUnread: false,
			});
			const otherThreadId = await ctx.db.insert("emailThreads", {
				organizationId: otherOrganizationId,
				inboxId: otherInboxId,
				lastActivityAt: 2_000,
				isUnread: true,
			});
			return {
				firstInboxId,
				otherInboxId,
				secondInboxId,
				firstThreadId,
				secondThreadId,
				otherThreadId,
			};
		});
		const actor = base.withIdentity({
			issuer: ISSUER,
			subject: "user_adam",
			org_id: "org_merimoar",
		});

		const inboxes = await actor.query(api.email.reader.listInboxes, {});
		expect(inboxes.map((inbox) => inbox._id)).toEqual([
			firstInboxId,
			secondInboxId,
		]);
		expect(inboxes.map((inbox) => inbox.unreadCount)).toEqual([1, 0]);
		const threads = await actor.query(api.email.reader.listThreads, {
			paginationOpts: { numItems: 10, cursor: null },
		});
		expect(threads.page.map(({ thread }) => thread._id)).toEqual([
			secondThreadId,
			firstThreadId,
		]);
		const firstInboxThreads = await actor.query(api.email.reader.listThreads, {
			inboxId: firstInboxId,
			paginationOpts: { numItems: 10, cursor: null },
		});
		expect(firstInboxThreads.page.map(({ thread }) => thread._id)).toEqual([
			firstThreadId,
		]);
		await expect(
			actor.query(api.email.reader.listThreads, {
				inboxId: otherInboxId,
				paginationOpts: { numItems: 10, cursor: null },
			}),
		).rejects.toThrow("could not be found");
		expect(
			await actor.query(api.email.reader.getThread, {
				threadId: otherThreadId,
			}),
		).toBeNull();
		expect(
			await actor.query(api.email.reader.getThread, {
				threadId: "not-a-thread-id",
			}),
		).toBeNull();
		await actor.mutation(api.email.reader.setUnread, {
			threadId: firstThreadId,
			isUnread: false,
		});
		expect(
			await actor.query(api.email.reader.getThread, {
				threadId: firstThreadId,
			}),
		).toMatchObject({ thread: { isUnread: false } });
		expect(
			(await actor.query(api.email.reader.listInboxes, {}))[0],
		).toMatchObject({ _id: firstInboxId, unreadCount: 0 });
		await actor.mutation(api.email.reader.setUnread, {
			threadId: firstThreadId,
			isUnread: true,
		});
		expect(
			await actor.query(api.email.reader.getThread, {
				threadId: firstThreadId,
			}),
		).toMatchObject({ thread: { isUnread: true } });
		expect(
			(await actor.query(api.email.reader.listInboxes, {}))[0],
		).toMatchObject({ _id: firstInboxId, unreadCount: 1 });
		await actor.mutation(api.email.reader.setUnread, {
			threadId: firstThreadId,
			isUnread: true,
		});
		expect(
			(await actor.query(api.email.reader.listInboxes, {}))[0],
		).toMatchObject({ _id: firstInboxId, unreadCount: 1 });
		await expect(
			actor.mutation(api.email.reader.setUnread, {
				threadId: otherThreadId,
				isUnread: true,
			}),
		).rejects.toThrow("could not be found");
		await expect(
			base.mutation(api.email.reader.setUnread, {
				threadId: firstThreadId,
				isUnread: true,
			}),
		).rejects.toThrow("Sign in");
		await expect(base.query(api.email.reader.listInboxes, {})).rejects.toThrow(
			"Sign in",
		);
		await expect(
			base.query(api.email.reader.listThreads, {
				paginationOpts: { numItems: 10, cursor: null },
			}),
		).rejects.toThrow("Sign in");
	});
});
