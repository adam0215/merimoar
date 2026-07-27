/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { createTest, syncWorkosUser } from "../test.setup";

// TEST FIXTURES: The Merimoar organization, people, emails, and WorkOS-style
// identifiers below exist only in convex-test's isolated in-memory database.
const ISSUER = "https://api.workos.com/";
const ADAM_SUBJECT = "user_adam";
const OTHER_SUBJECT = "user_other";

async function createFixture() {
	const base = createTest();
	await Promise.all([
		syncWorkosUser(base, {
			id: ADAM_SUBJECT,
			name: "Adam Gustafsson",
			email: "adam@merimoar.com",
		}),
		syncWorkosUser(base, {
			id: "user_sara",
			name: "Sara Lind",
			email: "sara@merimoar.com",
		}),
		syncWorkosUser(base, {
			id: OTHER_SUBJECT,
			name: "Other User",
			email: "other@example.com",
		}),
	]);
	const ids = await base.run(async (ctx) => {
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
		const actorMemberId = await ctx.db.insert("organizationMembers", {
			organizationId,
			workosUserId: ADAM_SUBJECT,
			active: true,
		});
		const ownerMemberId = await ctx.db.insert("organizationMembers", {
			organizationId,
			workosUserId: "user_sara",
			active: true,
		});
		await ctx.db.insert("organizationMembers", {
			organizationId: otherOrganizationId,
			workosUserId: OTHER_SUBJECT,
			active: true,
		});
		const contactId = await ctx.db.insert("contacts", {
			organizationId,
			name: "Elin Andersson",
			address: "elin@example.com",
			firstSeenAt: 100,
			lastSeenAt: 200,
		});
		const otherContactId = await ctx.db.insert("contacts", {
			organizationId: otherOrganizationId,
			name: "Other contact",
			address: "other@example.com",
			firstSeenAt: 100,
			lastSeenAt: 200,
		});
		const entityTypeId = await ctx.db.insert("entityTypes", {
			organizationId,
			key: "property",
			name: "Property",
			pluralName: "Properties",
			identifierLabel: "Property ID",
			description: "",
			icon: "home",
			archivedAt: null,
		});
		const entityId = await ctx.db.insert("entities", {
			entityTypeId,
			identifier: "FAST-1",
			normalizedIdentifier: "fast-1",
			displayName: "Storgatan 12",
			createdAt: 100,
			updatedAt: 100,
			archivedAt: null,
		});
		return {
			organizationId,
			actorMemberId,
			ownerMemberId,
			contactId,
			otherContactId,
			entityId,
		};
	});

	return {
		base,
		actor: base.withIdentity({
			issuer: ISSUER,
			subject: ADAM_SUBJECT,
			org_id: "org_merimoar",
		}),
		otherActor: base.withIdentity({
			issuer: ISSUER,
			subject: OTHER_SUBJECT,
			org_id: "org_other",
		}),
		...ids,
	};
}

describe("cases", () => {
	it("derives tenant and audit actor from WorkOS identity", async () => {
		const { actor, actorMemberId, ownerMemberId, contactId, entityId } =
			await createFixture();
		const caseId = await actor.mutation(api.case.mutations.create, {
			title: "Missing keys before possession",
			description: "Coordinate the handover.",
			ownerMemberId,
			dueAt: 2_000,
			initialEventBody: "Buyer reported two missing keys.",
			contactIds: [contactId],
			entityIds: [entityId],
		});

		const detail = await actor.query(api.case.reader.get, { caseId });
		expect(detail?.case).toMatchObject({
			title: "Missing keys before possession",
			ownerMemberId,
			dueAt: 2_000,
			status: "open",
		});
		expect(detail?.case.reference).toMatch(/^CASE-[A-F0-9]{6}$/);
		expect(detail?.events[0]?.event.createdByMemberId).toBe(actorMemberId);
		expect(detail?.contacts[0]?.relation.addedByMemberId).toBe(actorMemberId);
		expect(detail?.entities[0]?.relation.addedByMemberId).toBe(actorMemberId);
	});

	it("preserves relation history and records the removing actor", async () => {
		const { actor, actorMemberId, ownerMemberId, contactId } =
			await createFixture();
		const caseId = await actor.mutation(api.case.mutations.create, {
			title: "Contract amendment",
			description: "",
			ownerMemberId,
			dueAt: null,
			initialEventBody: "",
			contactIds: [contactId],
			entityIds: [],
		});
		const before = await actor.query(api.case.reader.get, { caseId });
		const relationId = before?.contacts[0]?.relation._id;
		if (!relationId) {
			throw new Error("Missing test relation");
		}

		await actor.mutation(api.case.mutations.removeContactRelation, {
			relationId,
		});

		const after = await actor.query(api.case.reader.get, { caseId });
		const historicalRelation = await actor.run(async (ctx) =>
			ctx.db.get(relationId),
		);
		expect(after?.contacts).toHaveLength(0);
		expect(after?.events[0]?.event.body).toContain("Removed Elin Andersson");
		expect(after?.events[0]?.event.createdByMemberId).toBe(actorMemberId);
		expect(historicalRelation).toMatchObject({
			endedAt: expect.any(Number),
			removedByMemberId: actorMemberId,
		});
	});

	it("rejects unauthenticated calls", async () => {
		const { base, ownerMemberId } = await createFixture();
		await expect(
			base.mutation(api.case.mutations.create, {
				title: "Unauthenticated",
				description: "",
				ownerMemberId,
				dueAt: null,
				initialEventBody: "",
				contactIds: [],
				entityIds: [],
			}),
		).rejects.toThrow("Sign in");
		await expect(
			base.query(api.case.reader.getCreateOptions, {}),
		).rejects.toThrow("Sign in");
	});

	it("prevents cross-tenant reads, writes, and relations", async () => {
		const { actor, otherActor, ownerMemberId, otherContactId } =
			await createFixture();
		await expect(
			actor.mutation(api.case.mutations.create, {
				title: "Invalid relation",
				description: "",
				ownerMemberId,
				dueAt: null,
				initialEventBody: "",
				contactIds: [otherContactId],
				entityIds: [],
			}),
		).rejects.toThrow("does not belong");

		const caseId = await actor.mutation(api.case.mutations.create, {
			title: "Tenant-owned case",
			description: "",
			ownerMemberId,
			dueAt: null,
			initialEventBody: "",
			contactIds: [],
			entityIds: [],
		});
		expect(await otherActor.query(api.case.reader.get, { caseId })).toBeNull();
		await expect(
			otherActor.mutation(api.case.mutations.update, {
				caseId,
				title: "Cross-tenant update",
				description: "",
				ownerMemberId: null,
				dueAt: null,
				status: "open",
			}),
		).rejects.toThrow("could not be found");
	});

	it("normalizes inline events and attributes them to the actor", async () => {
		const { actor, actorMemberId, ownerMemberId } = await createFixture();
		const caseId = await actor.mutation(api.case.mutations.create, {
			title: "Photography rescheduling",
			description: "",
			ownerMemberId,
			dueAt: null,
			initialEventBody: "",
			contactIds: [],
			entityIds: [],
		});
		const before = await actor.run(async (ctx) => ctx.db.get(caseId));

		await actor.mutation(api.case.mutations.addEvent, {
			caseId,
			body: "  New appointment confirmed.  ",
		});

		const detail = await actor.query(api.case.reader.get, { caseId });
		expect(detail?.events[0]?.event).toMatchObject({
			body: "New appointment confirmed.",
			createdByMemberId: actorMemberId,
		});
		expect(detail?.case.lastActivityAt).toBeGreaterThanOrEqual(
			before?.lastActivityAt ?? 0,
		);
	});

	it("accepts case descriptions without a character limit", async () => {
		const { actor, ownerMemberId } = await createFixture();
		const description = `<p>${"Detailed handover context. ".repeat(250)}</p>`;
		const caseId = await actor.mutation(api.case.mutations.create, {
			title: "Long handover context",
			description,
			ownerMemberId,
			dueAt: null,
			initialEventBody: "",
			contactIds: [],
			entityIds: [],
		});

		const detail = await actor.query(api.case.reader.get, { caseId });
		expect(description.length).toBeGreaterThan(4_000);
		expect(detail?.case.description).toBe(description);
	});
});
