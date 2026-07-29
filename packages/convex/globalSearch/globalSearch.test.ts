/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { createTest, syncWorkosUser } from "#/test.setup";
import { api, internal } from "../_generated/api";

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
		const inboxId = await ctx.db.insert("emailInboxes", {
			organizationId,
			displayName: "Support",
			address: "inbox@merimoar.test",
			status: "active",
			unreadThreadCount: 0,
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
		const ingestEventId = await ctx.db.insert("emailIngestEvents", {
			inboxId,
			integrationId,
			externalEventId: "contact-event",
			externalMessageId: "contact-message",
			eventType: "email.received",
			status: "queued",
			rawPayload: "{}",
			receivedAt: 1_100,
			attempts: 0,
			replayCount: 0,
			processingGeneration: 0,
		});
		return { ingestEventId, organizationId, otherOrganizationId };
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
	it("lists the five latest relation candidates across supported types", async () => {
		const { actor, base, organizationId, otherOrganizationId } =
			await createFixture();
		await base.run(async (ctx) => {
			const entityTypeId = await ctx.db.insert("entityTypes", {
				organizationId,
				key: "contract",
				name: "Contract",
				pluralName: "Contracts",
				identifierLabel: "Contract ID",
				description: "",
				icon: "contract",
				archivedAt: null,
			});
			await ctx.db.insert("contacts", {
				organizationId,
				address: "latest@example.com",
				name: "Latest contact",
				firstSeenAt: 100,
				lastSeenAt: 6_000,
			});
			await ctx.db.insert("cases", {
				organizationId,
				reference: "CASE-RECENT",
				title: "Recent case",
				description: "",
				ownerMemberId: null,
				dueAt: null,
				status: "open",
				lastActivityAt: 5_000,
				createdAt: 100,
				updatedAt: 5_000,
			});
			await ctx.db.insert("entities", {
				entityTypeId,
				identifier: "CONTRACT-4",
				normalizedIdentifier: "contract-4",
				displayName: "Recent contract",
				createdAt: 100,
				updatedAt: 4_000,
				archivedAt: null,
			});
			for (let index = 3; index >= 1; index -= 1) {
				await ctx.db.insert("contacts", {
					organizationId,
					address: `contact-${index}@example.com`,
					name: `Contact ${index}`,
					firstSeenAt: 100,
					lastSeenAt: index * 1_000,
				});
			}
			await ctx.db.insert("cases", {
				organizationId: otherOrganizationId,
				reference: "CASE-SECRET",
				title: "Other organization case",
				description: "",
				ownerMemberId: null,
				dueAt: null,
				status: "open",
				lastActivityAt: 10_000,
				createdAt: 100,
				updatedAt: 10_000,
			});
		});

		const candidates = await actor.query(
			api.globalSearch.reader.listRecentRelationshipCandidates,
			{},
		);
		expect(candidates).toHaveLength(5);
		expect(candidates.map((candidate) => candidate.target.kind)).toEqual([
			"contact",
			"case",
			"entity",
			"contact",
			"contact",
		]);
		expect(
			candidates.some(
				(candidate) =>
					candidate.identifier === "CASE-SECRET" ||
					candidate.label === "Other organization case",
			),
		).toBe(false);
	});

	it("searches relation-capable objects by their identifier", async () => {
		const { actor, base, ingestEventId } = await createFixture();
		await base.mutation(internal.email.ingest.storeInboundEmail, {
			eventId: ingestEventId,
			processingGeneration: 0,
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
				icon: "home",
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

	it("backfills search entries for existing relation-capable objects", async () => {
		const { actor, base } = await createFixture();
		const legacy = await actor.run(async (ctx) => {
			const organization = await ctx.db
				.query("organizations")
				.withIndex("by_workos_organization_id", (index) =>
					index.eq("workosOrganizationId", "org_merimoar"),
				)
				.unique();
			if (!organization) {
				throw new Error("Expected the organization");
			}

			const entityTypeId = await ctx.db.insert("entityTypes", {
				organizationId: organization._id,
				key: "legacy-property",
				name: "Legacy property",
				pluralName: "Legacy properties",
				identifierLabel: "Property ID",
				description: "",
				icon: "estate",
				archivedAt: null,
			});
			const contactId = await ctx.db.insert("contacts", {
				organizationId: organization._id,
				address: "legacy@example.com",
				name: "Legacy Contact",
				firstSeenAt: 1,
				lastSeenAt: 1,
			});
			const entityId = await ctx.db.insert("entities", {
				entityTypeId,
				identifier: "LEGACY-ENTITY-1",
				normalizedIdentifier: "legacy-entity-1",
				displayName: "Legacy Home",
				createdAt: 1,
				updatedAt: 1,
				archivedAt: null,
			});
			const caseId = await ctx.db.insert("cases", {
				organizationId: organization._id,
				reference: "LEGACY-CASE-1",
				title: "Legacy Case",
				description: "",
				ownerMemberId: null,
				dueAt: null,
				status: "open",
				lastActivityAt: 1,
				createdAt: 1,
				updatedAt: 1,
			});

			return { caseId, contactId, entityId };
		});

		await expect(
			actor.query(api.globalSearch.reader.search, {
				query: "legacy@example.com",
			}),
		).resolves.toEqual([]);

		await expect(
			base.mutation(
				internal.globalSearch.model.backfillExistingSearchEntries,
				{},
			),
		).resolves.toMatchObject({
			contacts: 1,
			cases: 1,
			entities: 1,
		});

		const [contactResults, entityResults, caseResults] = await Promise.all([
			actor.query(api.globalSearch.reader.search, {
				query: "legacy@example.com",
			}),
			actor.query(api.globalSearch.reader.search, {
				query: "LEGACY-ENTITY-1",
			}),
			actor.query(api.globalSearch.reader.search, {
				query: "LEGACY-CASE-1",
			}),
		]);

		expect(contactResults).toMatchObject([
			{ target: { kind: "contact", contactId: legacy.contactId } },
		]);
		expect(entityResults).toMatchObject([
			{ target: { kind: "entity", entityId: legacy.entityId } },
		]);
		expect(caseResults).toMatchObject([
			{ target: { kind: "case", caseId: legacy.caseId } },
		]);
	});

	it("requires an authenticated organization member", async () => {
		const { base } = await createFixture();
		await expect(
			base.query(api.globalSearch.reader.search, { query: "FAST-1042" }),
		).rejects.toThrow("Sign in");
	});
});
