/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import { createTest, syncWorkosUser } from "../test.setup";

const ISSUER = "https://api.workos.com/";

async function createFixture() {
	const base = createTest();
	await Promise.all([
		syncWorkosUser(base, {
			id: "user_adam",
			name: "Adam Gustafsson",
			email: "adam@merimoar.com",
		}),
		syncWorkosUser(base, {
			id: "user_other",
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
		const connectionId = await ctx.db.insert("emailConnections", {
			organizationId,
			provider: "resend",
			displayName: "Support",
			address: "inbox@merimoar.test",
			status: "active",
		});
		const ingestEventId = await ctx.db.insert("emailIngestEvents", {
			connectionId,
			externalEventId: "contact-event",
			externalMessageId: "contact-message",
			eventType: "email.received",
			status: "pending",
			rawPayload: "{}",
			receivedAt: 1_100,
			attempts: 0,
		});
		return { ingestEventId };
	});

	return {
		base,
		actor: base.withIdentity({
			issuer: ISSUER,
			subject: "user_adam",
			org_id: "org_merimoar",
		}),
		otherActor: base.withIdentity({
			issuer: ISSUER,
			subject: "user_other",
			org_id: "org_other",
		}),
		...ids,
	};
}

async function createEntity(
	actor: Awaited<ReturnType<typeof createFixture>>["actor"],
	identifier: string,
	displayName: string,
) {
	const entityTypeId = await actor.mutation(api.entity.mutations.createType, {
		name: "Property",
		pluralName: "Properties",
		identifierLabel: "Property ID",
		description: "",
		icon: "home",
	});
	return await actor.mutation(api.entity.mutations.createEntity, {
		entityTypeId,
		identifier,
		displayName,
		values: [],
	});
}

describe("global search", () => {
	it("searches relation-capable objects by their identifier", async () => {
		const { actor, base, ingestEventId } = await createFixture();
		await base.mutation(internal.email.ingest.storeInboundEmail, {
			eventId: ingestEventId,
			email: {
				externalMessageId: "contact-message",
				internetMessageId: "<contact-message@example.com>",
				references: [],
				from: { name: "Ada Lovelace", address: "ada@example.com" },
				to: [{ address: "inbox@merimoar.test" }],
				cc: [],
				bcc: [],
				replyTo: [],
				subject: "Search indexing",
				textBody: "Please add me to the index.",
				sentAt: 1_000,
				receivedAt: 1_100,
			},
		});
		const entityId = await createEntity(actor, "FAST-1042", "Storgatan 12");
		const relatedCaseId = await actor.mutation(api.case.mutations.create, {
			title: "Related handover",
			description: "",
			ownerMemberId: null,
			dueAt: null,
			initialEventBody: "",
			contactIds: [],
			entityIds: [],
			relatedCaseIds: [],
		});
		const relatedCase = await actor.run(async (ctx) =>
			ctx.db.get(relatedCaseId),
		);
		if (!relatedCase) {
			throw new Error("Expected the related case");
		}
		const caseId = await actor.mutation(api.case.mutations.create, {
			title: "Missing keys",
			description: "",
			ownerMemberId: null,
			dueAt: null,
			initialEventBody: "",
			contactIds: [],
			entityIds: [],
			relatedCaseIds: [relatedCaseId],
		});

		const [contactResults, entityResults, caseResults] = await Promise.all([
			actor.query(api.globalSearch.reader.search, {
				query: "ada@example.com",
			}),
			actor.query(api.globalSearch.reader.search, { query: "FAST-1042" }),
			actor.query(api.globalSearch.reader.search, {
				query: relatedCase.reference,
			}),
		]);
		const caseDetail = await actor.query(api.case.reader.get, { caseId });

		expect(contactResults).toMatchObject([
			{
				target: { kind: "contact" },
				identifier: "ada@example.com",
				label: "Ada Lovelace",
			},
		]);
		expect(entityResults).toMatchObject([
			{
				target: { kind: "entity", entityId },
				identifier: "FAST-1042",
				label: "Storgatan 12",
				descriptor: "Property",
			},
		]);
		expect(caseResults).toMatchObject([
			{
				target: { kind: "case", caseId: relatedCaseId },
				identifier: relatedCase.reference,
				label: "Related handover",
			},
		]);
		expect(caseDetail?.relatedCases).toMatchObject([
			{ relatedCase: { _id: relatedCaseId } },
		]);
	});

	it("also searches display text and keeps results inside the organization", async () => {
		const { actor, otherActor } = await createFixture();
		const entityId = await createEntity(actor, "FAST-2000", "Storgatan 12");
		await createEntity(otherActor, "SECRET-9000", "Hidden property");

		expect(
			await actor.query(api.globalSearch.reader.search, { query: "Storgatan" }),
		).toMatchObject([{ target: { kind: "entity", entityId } }]);
		expect(
			await actor.query(api.globalSearch.reader.search, {
				query: "SECRET-9000",
			}),
		).toEqual([]);
		expect(
			await actor.query(api.globalSearch.reader.search, { query: "   " }),
		).toEqual([]);
	});

	it("requires an authenticated organization member", async () => {
		const { base } = await createFixture();
		await expect(
			base.query(api.globalSearch.reader.search, { query: "FAST-1042" }),
		).rejects.toThrow("Sign in");
	});
});
