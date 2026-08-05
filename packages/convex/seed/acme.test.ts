import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { insertAcmeDataset } from "#/seed/acme";
import {
	ACME_CASE_RELATIONS,
	ACME_CASES,
	ACME_CONTACTS,
	ACME_DATASET_VERSION,
	ACME_DEPLOYMENT_URL,
	ACME_EMAIL_THREADS,
	ACME_ENTITIES,
	ACME_ENTITY_TYPES,
	ACME_WORKOS_ORGANIZATION_ID,
	assertAcmeDatasetIsInternallyConsistent,
	calculateAcmeCreationCounts,
	calculateAcmeDatasetFingerprint,
} from "#/seed/acmeData";
import { createTest } from "#/test.setup";
import { internal } from "../_generated/api";

const REPLACEMENT_CONFIRMATION =
	"replace-acme-residential-management-v3-after-reviewed-preview" as const;

beforeEach(() => {
	vi.stubEnv("CONVEX_CLOUD_URL", ACME_DEPLOYMENT_URL);
});

afterEach(() => {
	vi.unstubAllEnvs();
});

async function createAcmeFixture() {
	const test = createTest();
	const ids = await test.run(async (ctx) => {
		const organizationId = await ctx.db.insert("organizations", {
			name: "Acme AB",
			workosOrganizationId: ACME_WORKOS_ORGANIZATION_ID,
			referenceSlug: "ACME",
			active: true,
		});
		const memberId = await ctx.db.insert("organizationMembers", {
			organizationId,
			workosUserId: "user_acme_seed_owner",
			active: true,
		});
		const otherOrganizationId = await ctx.db.insert("organizations", {
			name: "Other organization",
			workosOrganizationId: "org_other_seed_fixture",
			referenceSlug: "OTHR",
			active: true,
		});
		const otherMemberId = await ctx.db.insert("organizationMembers", {
			organizationId: otherOrganizationId,
			workosUserId: "user_other_seed_owner",
			active: true,
		});
		const otherCaseId = await ctx.db.insert("cases", {
			organizationId: otherOrganizationId,
			reference: "OTHER-001",
			title: "Other organization case",
			description: "This row must never be changed by the Acme replacement.",
			ownerMemberId: otherMemberId,
			dueAt: null,
			status: "open",
			lastActivityAt: 1,
			createdAt: 1,
			updatedAt: 1,
		});
		return {
			organizationId,
			memberId,
			otherOrganizationId,
			otherCaseId,
		};
	});

	await test.run(async (ctx) => {
		const [organization, owner] = await Promise.all([
			ctx.db.get(ids.organizationId),
			ctx.db.get(ids.memberId),
		]);
		if (!organization || !owner)
			throw new Error("Test Acme fixture is missing");
		await insertAcmeDataset(ctx, organization, owner);
	});

	return { test, ...ids };
}

describe("Acme residential management seed fixture", () => {
	it("is deterministic, normalized, chronological, and internally complete", () => {
		const counts = assertAcmeDatasetIsInternallyConsistent();
		expect(counts).toEqual(calculateAcmeCreationCounts());
		expect(counts).toMatchObject({
			emailIntegrations: 1,
			connectedAccounts: 1,
			emailInboxes: 1,
			emailThreads: 17,
			emailThreadExternalReferences: 17,
			contacts: 12,
			entityTypes: 3,
			entityFieldDefinitions: 16,
			entities: 11,
			entityTextFieldValues: 25,
			entityNumberFieldValues: 12,
			entityBooleanFieldValues: 11,
			entityDateFieldValues: 11,
			cases: 9,
			agentTasks: 0,
			agentTurns: 0,
			agentRuns: 0,
			agentItems: 0,
			caseEmbeddings: 0,
			globalSearchEntries: 32,
			caseEvents: 68,
			caseContactRelations: 24,
			caseEntityRelations: 27,
			caseCaseRelations: 3,
			caseEmailThreadRelations: 14,
			emailMessages: 48,
			emailSends: 16,
			emailDrafts: 0,
			emailIngestEvents: 0,
			emailIngestRecipients: 0,
		});

		expect(new Set(ACME_CONTACTS.map((contact) => contact.address)).size).toBe(
			ACME_CONTACTS.length,
		);
		expect(new Set(ACME_ENTITIES.map((entity) => entity.key)).size).toBe(
			ACME_ENTITIES.length,
		);
		expect(
			ACME_CASES.every((caseSeed) =>
				ACME_EMAIL_THREADS.some(
					(thread) => thread.caseReference === caseSeed.reference,
				),
			),
		).toBe(true);
		expect(
			ACME_EMAIL_THREADS.every((thread) =>
				thread.messages.every(
					(message, index) =>
						index === 0 ||
						message.sentAt > (thread.messages[index - 1]?.sentAt ?? 0),
				),
			),
		).toBe(true);
		expect(ACME_CASE_RELATIONS).toEqual([
			["ACM-26071", "ACM-26072"],
			["ACM-26071", "ACM-26073"],
			["ACM-26044", "ACM-26061"],
		]);
		expect(ACME_ENTITY_TYPES.map((entityType) => entityType.key)).toEqual([
			"fastighetsagare",
			"fastighet",
			"leverantor",
		]);
		expect(
			ACME_CONTACTS.filter((contact) =>
				["maja-lind", "fredrik-holm"].includes(contact.key),
			).map((contact) => contact.name),
		).toEqual(["Maja Lind", "Fredrik Holm"]);
		expect(
			ACME_CASES.find((caseSeed) => caseSeed.reference === "ACM-26077"),
		).toMatchObject({
			status: "needs_attention",
			contactKeys: ["maja-lind", "fredrik-holm", "oskar-nyberg", "daniel-berg"],
			entityKeys: [
				"owner-vasterhamn",
				"property-ankaret",
				"supplier-gotadrift",
			],
		});
		expect(
			ACME_EMAIL_THREADS.filter(
				(thread) => thread.caseReference === "ACM-26077",
			),
		).toHaveLength(2);
		const liftQuoteCase = ACME_CASES.find(
			(caseSeed) => caseSeed.reference === "ACM-26069",
		);
		expect(liftQuoteCase).toMatchObject({ status: "needs_attention" });
		expect(liftQuoteCase?.description).toContain(
			"ingen offert har ännu begärts eller skapats",
		);
		expect(liftQuoteCase?.initialNote).toContain(
			"begära en icke-bindande offert",
		);
		expect(
			ACME_EMAIL_THREADS.find(
				(thread) =>
					thread.key === "hisspartner-door-operator-quote-request-basis",
			)?.messages.at(-1)?.body,
		).toContain("Ingen offert finns registrerad ännu");
		expect(calculateAcmeDatasetFingerprint()).toMatch(/^[0-9a-f]{8}$/);
		const entityTypeByKey = new Map(
			ACME_ENTITIES.map((entity) => [entity.key, entity.entityTypeKey]),
		);
		expect(
			ACME_CASES.every(
				(caseSeed) =>
					caseSeed.entityKeys.filter(
						(key) => entityTypeByKey.get(key) === "fastighet",
					).length === 1,
			),
		).toBe(true);
	});

	it("creates the complete graph without scheduling embeddings or external work", async () => {
		const { test, organizationId } = await createAcmeFixture();
		const preview = await test.query(internal.seed.acmeReplacement.preview, {
			deploymentUrl: ACME_DEPLOYMENT_URL,
			organizationId,
		});

		expect(preview.datasetVersion).toBe(ACME_DATASET_VERSION);
		expect(preview.datasetFingerprint).toBe(calculateAcmeDatasetFingerprint());
		expect(preview.removalCounts).toEqual(calculateAcmeCreationCounts());
		expect(preview.creationCounts).toEqual(calculateAcmeCreationCounts());
		expect(preview.previewToken).toMatch(
			/^acme-preview-acme-residential-management-v3-[0-9a-f]{8}$/,
		);

		const state = await test.run(async (ctx) => ({
			inbox: await ctx.db
				.query("emailInboxes")
				.withIndex("by_organization_id", (index) =>
					index.eq("organizationId", organizationId),
				)
				.unique(),
			cases: await ctx.db
				.query("cases")
				.withIndex("by_organization_id_and_last_activity_at", (index) =>
					index.eq("organizationId", organizationId),
				)
				.collect(),
			threads: await ctx.db
				.query("emailThreads")
				.withIndex("by_organization_id_and_last_activity_at", (index) =>
					index.eq("organizationId", organizationId),
				)
				.collect(),
			embeddings: await ctx.db.query("caseEmbeddings").collect(),
			agentTasks: await ctx.db
				.query("agentTasks")
				.withIndex("by_organization_id_and_requested_at", (index) =>
					index.eq("organizationId", organizationId),
				)
				.collect(),
		}));

		expect(state.inbox).toMatchObject({
			displayName: "Acme Kundcenter",
			address: "service@acme.seed.invalid",
			status: "active",
			unreadThreadCount: 10,
		});
		expect(state.inbox?.outbound).toBeUndefined();
		expect(
			state.cases.map((caseRecord) => caseRecord.reference).sort(),
		).toEqual(ACME_CASES.map((caseSeed) => caseSeed.reference).sort());
		expect(state.threads).toHaveLength(17);
		expect(state.embeddings).toEqual([]);
		expect(state.agentTasks).toEqual([]);
	});
});

describe("Acme organization-scoped replacement gate", () => {
	it("atomically replaces Acme while preserving its membership and every foreign row", async () => {
		const { test, organizationId, memberId, otherOrganizationId, otherCaseId } =
			await createAcmeFixture();
		const before = await test.run(async (ctx) => ({
			caseIds: (
				await ctx.db
					.query("cases")
					.withIndex("by_organization_id_and_last_activity_at", (index) =>
						index.eq("organizationId", organizationId),
					)
					.collect()
			).map((caseRecord) => caseRecord._id),
			otherCase: await ctx.db.get(otherCaseId),
		}));
		const preview = await test.query(internal.seed.acmeReplacement.preview, {
			deploymentUrl: ACME_DEPLOYMENT_URL,
			organizationId,
		});

		const result = await test.mutation(internal.seed.acmeReplacement.replace, {
			deploymentUrl: ACME_DEPLOYMENT_URL,
			organizationId,
			expectedWorkosOrganizationId: ACME_WORKOS_ORGANIZATION_ID,
			expectedRemovalCounts: preview.removalCounts,
			expectedCreationCounts: preview.creationCounts,
			previewToken: preview.previewToken,
			confirmation: REPLACEMENT_CONFIRMATION,
		});

		expect(result).toMatchObject({
			datasetVersion: ACME_DATASET_VERSION,
			datasetFingerprint: calculateAcmeDatasetFingerprint(),
			organizationId,
			preservedOrganizationMembers: 1,
			removed: preview.removalCounts,
			created: preview.creationCounts,
		});
		const after = await test.run(async (ctx) => ({
			organization: await ctx.db.get(organizationId),
			member: await ctx.db.get(memberId),
			caseIds: (
				await ctx.db
					.query("cases")
					.withIndex("by_organization_id_and_last_activity_at", (index) =>
						index.eq("organizationId", organizationId),
					)
					.collect()
			).map((caseRecord) => caseRecord._id),
			otherCases: await ctx.db
				.query("cases")
				.withIndex("by_organization_id_and_last_activity_at", (index) =>
					index.eq("organizationId", otherOrganizationId),
				)
				.collect(),
		}));

		expect(after.organization).toMatchObject({
			_id: organizationId,
			name: "Acme AB",
			workosOrganizationId: ACME_WORKOS_ORGANIZATION_ID,
		});
		expect(after.member).toMatchObject({ _id: memberId, organizationId });
		expect(after.caseIds).toHaveLength(9);
		expect(after.caseIds.some((id) => before.caseIds.includes(id))).toBe(false);
		expect(after.otherCases).toEqual([before.otherCase]);
	});

	it("rejects a stale preview before deleting anything", async () => {
		const { test, organizationId } = await createAcmeFixture();
		const preview = await test.query(internal.seed.acmeReplacement.preview, {
			deploymentUrl: ACME_DEPLOYMENT_URL,
			organizationId,
		});
		const extraCaseId = await test.run(async (ctx) =>
			ctx.db.insert("cases", {
				organizationId,
				reference: "ACM-STALE-PREVIEW",
				title: "Changed after preview",
				description: "The replacement must stop before mutation.",
				ownerMemberId: null,
				dueAt: null,
				status: "open",
				lastActivityAt: 2,
				createdAt: 2,
				updatedAt: 2,
			}),
		);

		await expect(
			test.mutation(internal.seed.acmeReplacement.replace, {
				deploymentUrl: ACME_DEPLOYMENT_URL,
				organizationId,
				expectedWorkosOrganizationId: ACME_WORKOS_ORGANIZATION_ID,
				expectedRemovalCounts: preview.removalCounts,
				expectedCreationCounts: preview.creationCounts,
				previewToken: preview.previewToken,
				confirmation: REPLACEMENT_CONFIRMATION,
			}),
		).rejects.toThrow(/removal count for cases/);

		const state = await test.run(async (ctx) => ({
			extraCase: await ctx.db.get(extraCaseId),
			cases: await ctx.db
				.query("cases")
				.withIndex("by_organization_id_and_last_activity_at", (index) =>
					index.eq("organizationId", organizationId),
				)
				.collect(),
		}));
		expect(state.extraCase).not.toBeNull();
		expect(state.cases).toHaveLength(10);
	});

	it("rejects cross-organization references and leaves both organizations intact", async () => {
		const { test, organizationId, otherCaseId } = await createAcmeFixture();
		const acmeContactId = await test.run(async (ctx) => {
			const contact = await ctx.db
				.query("contacts")
				.withIndex("by_organization_id_and_address", (index) =>
					index
						.eq("organizationId", organizationId)
						.eq("address", "hanna.ekstrom@vasterhamn.seed.invalid"),
				)
				.unique();
			if (!contact) throw new Error("Expected Acme contact");
			await ctx.db.insert("caseContactRelations", {
				caseId: otherCaseId,
				contactId: contact._id,
				startedAt: 3,
				endedAt: null,
				addedByMemberId: null,
				removedByMemberId: null,
			});
			return contact._id;
		});

		await expect(
			test.query(internal.seed.acmeReplacement.preview, {
				deploymentUrl: ACME_DEPLOYMENT_URL,
				organizationId,
			}),
		).rejects.toThrow(/another organization shares an Acme contact relation/);

		const state = await test.run(async (ctx) => ({
			contact: await ctx.db.get(acmeContactId),
			otherCase: await ctx.db.get(otherCaseId),
			acmeCases: await ctx.db
				.query("cases")
				.withIndex("by_organization_id_and_last_activity_at", (index) =>
					index.eq("organizationId", organizationId),
				)
				.collect(),
		}));
		expect(state.contact).not.toBeNull();
		expect(state.otherCase).not.toBeNull();
		expect(state.acmeCases).toHaveLength(9);
	});

	it("rejects execution when the runtime deployment does not match", async () => {
		const { test, organizationId } = await createAcmeFixture();
		vi.stubEnv("CONVEX_CLOUD_URL", "https://wrong-deployment.convex.cloud");

		await expect(
			test.query(internal.seed.acmeReplacement.preview, {
				deploymentUrl: ACME_DEPLOYMENT_URL,
				organizationId,
			}),
		).rejects.toThrow(/runtime deployment/);
	});
});
