import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { createTest, syncWorkosUser } from "../test.setup";

// TEST FIXTURES: The Merimoar organization, people, emails, and WorkOS-style
// identifiers below exist only in convex-test's isolated in-memory database.
const ISSUER = "https://api.workos.com/";

describe("email reader authorization", () => {
	it("lists every workspace thread across connections and excludes other organizations", async () => {
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
			firstConnectionId,
			secondConnectionId,
			firstThreadId,
			secondThreadId,
			otherThreadId,
		} = await base.run(async (ctx) => {
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
			const firstConnectionId = await ctx.db.insert("emailConnections", {
				organizationId,
				provider: "resend",
				displayName: "Support",
				address: "support@merimoar.test",
				status: "active",
			});
			const secondConnectionId = await ctx.db.insert("emailConnections", {
				organizationId,
				provider: "resend",
				displayName: "Operations",
				address: "operations@merimoar.test",
				status: "active",
			});
			const otherConnectionId = await ctx.db.insert("emailConnections", {
				organizationId: otherOrganizationId,
				provider: "resend",
				displayName: "Other",
				address: "inbox@other.test",
				status: "active",
			});
			const firstThreadId = await ctx.db.insert("emailThreads", {
				organizationId,
				connectionId: firstConnectionId,
				lastActivityAt: 1_000,
			});
			const secondThreadId = await ctx.db.insert("emailThreads", {
				organizationId,
				connectionId: secondConnectionId,
				lastActivityAt: 3_000,
			});
			const otherThreadId = await ctx.db.insert("emailThreads", {
				organizationId: otherOrganizationId,
				connectionId: otherConnectionId,
				lastActivityAt: 2_000,
			});
			return {
				firstConnectionId,
				secondConnectionId,
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

		const connections = await actor.query(api.email.reader.listConnections, {});
		expect(connections.map((connection) => connection._id)).toEqual([
			firstConnectionId,
			secondConnectionId,
		]);
		const threads = await actor.query(api.email.reader.listThreads, {
			paginationOpts: { numItems: 10, cursor: null },
		});
		expect(threads.page.map(({ thread }) => thread._id)).toEqual([
			secondThreadId,
			firstThreadId,
		]);
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
		await expect(
			base.query(api.email.reader.listConnections, {}),
		).rejects.toThrow("Sign in");
		await expect(
			base.query(api.email.reader.listThreads, {
				paginationOpts: { numItems: 10, cursor: null },
			}),
		).rejects.toThrow("Sign in");
	});
});
