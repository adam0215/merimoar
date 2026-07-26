import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { normalizeEntityIdentifier } from "../entity/constants";

async function upsertOrganization(ctx: MutationCtx) {
	const existing = await ctx.db
		.query("organizations")
		.withIndex("by_slug", (index) => index.eq("slug", "merimoar"))
		.unique();
	if (existing) {
		if (existing.workosOrganizationId === "org_merimoar_demo") {
			await ctx.db.patch("organizations", existing._id, {
				workosOrganizationId: undefined,
			});
		}
		return existing._id;
	}
	return await ctx.db.insert("organizations", {
		name: "Merimoar",
		slug: "merimoar",
	});
}

async function upsertMember(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	name: string,
	email: string,
) {
	const existing = await ctx.db
		.query("organizationMembers")
		.withIndex("by_organization_id_and_email", (index) =>
			index.eq("organizationId", organizationId).eq("email", email),
		)
		.unique();
	if (existing) {
		if (existing.tokenIdentifier?.endsWith("_demo")) {
			await ctx.db.patch("organizationMembers", existing._id, {
				tokenIdentifier: undefined,
			});
		}
		return existing._id;
	}
	return await ctx.db.insert("organizationMembers", {
		organizationId,
		name,
		email,
		status: "active",
	});
}

async function upsertContact(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	name: string,
	address: string,
	firstSeenAt: number,
	lastSeenAt: number,
) {
	const existing = await ctx.db
		.query("contacts")
		.withIndex("by_organization_id_and_address", (index) =>
			index.eq("organizationId", organizationId).eq("address", address),
		)
		.unique();
	if (existing) {
		return existing._id;
	}
	return await ctx.db.insert("contacts", {
		organizationId,
		name,
		address,
		firstSeenAt,
		lastSeenAt,
	});
}

export const seedCaseWorkspace = internalMutation({
	args: {},
	returns: v.union(v.literal("seeded"), v.literal("already_seeded")),
	handler: async (ctx) => {
		const organizationId = await upsertOrganization(ctx);
		const now = Date.now();
		const day = 24 * 60 * 60 * 1000;
		const [adamId, saraId] = [
			await upsertMember(
				ctx,
				organizationId,
				"Adam Gustafsson",
				"adam@merimoar.com",
			),
			await upsertMember(ctx, organizationId, "Sara Lind", "sara@merimoar.com"),
		];
		const existingCase = await ctx.db
			.query("cases")
			.withIndex("by_organization_id_and_reference", (index) =>
				index.eq("organizationId", organizationId).eq("reference", "CASE-1042"),
			)
			.unique();
		if (existingCase) {
			return "already_seeded";
		}

		const [elinId, marcusId, sofiaId] = [
			await upsertContact(
				ctx,
				organizationId,
				"Elin Andersson",
				"elin.andersson@example.com",
				now - 28 * day,
				now - 2 * 60 * 60 * 1000,
			),
			await upsertContact(
				ctx,
				organizationId,
				"Marcus Dahl",
				"marcus.dahl@example.com",
				now - 42 * day,
				now - day,
			),
			await upsertContact(
				ctx,
				organizationId,
				"Sofia Berg",
				"sofia.berg@example.com",
				now - 16 * day,
				now - 3 * day,
			),
		];

		const propertyTypeId = await ctx.db.insert("entityTypes", {
			organizationId,
			key: "property",
			name: "Property",
			pluralName: "Properties",
			identifierLabel: "Property ID",
			description: "Properties represented by the brokerage.",
			icon: "home",
			archivedAt: null,
		});
		const contractTypeId = await ctx.db.insert("entityTypes", {
			organizationId,
			key: "contract",
			name: "Contract",
			pluralName: "Contracts",
			identifierLabel: "Contract number",
			description: "Signed and pending agreements.",
			icon: "contract",
			archivedAt: null,
		});
		const appointmentTypeId = await ctx.db.insert("entityTypes", {
			organizationId,
			key: "appointment",
			name: "Appointment",
			pluralName: "Appointments",
			identifierLabel: "Appointment ID",
			description: "Viewings, photography and handover appointments.",
			icon: "calendar",
			archivedAt: null,
		});

		const propertyAddressFieldId = await ctx.db.insert(
			"entityFieldDefinitions",
			{
				entityTypeId: propertyTypeId,
				key: "address",
				label: "Address",
				valueType: "text",
				required: true,
				position: 0,
				archivedAt: null,
			},
		);
		const propertyMunicipalityFieldId = await ctx.db.insert(
			"entityFieldDefinitions",
			{
				entityTypeId: propertyTypeId,
				key: "municipality",
				label: "Municipality",
				valueType: "text",
				required: false,
				position: 1,
				archivedAt: null,
			},
		);
		const propertyPriceFieldId = await ctx.db.insert("entityFieldDefinitions", {
			entityTypeId: propertyTypeId,
			key: "asking-price",
			label: "Asking price",
			valueType: "number",
			required: false,
			position: 2,
			archivedAt: null,
		});
		const contractSignedAtFieldId = await ctx.db.insert(
			"entityFieldDefinitions",
			{
				entityTypeId: contractTypeId,
				key: "signed-at",
				label: "Signed date",
				valueType: "date",
				required: false,
				position: 0,
				archivedAt: null,
			},
		);
		const contractValueFieldId = await ctx.db.insert("entityFieldDefinitions", {
			entityTypeId: contractTypeId,
			key: "contract-value",
			label: "Contract value",
			valueType: "number",
			required: false,
			position: 1,
			archivedAt: null,
		});
		const appointmentDateFieldId = await ctx.db.insert(
			"entityFieldDefinitions",
			{
				entityTypeId: appointmentTypeId,
				key: "scheduled-at",
				label: "Scheduled date",
				valueType: "date",
				required: true,
				position: 0,
				archivedAt: null,
			},
		);
		const appointmentConfirmedFieldId = await ctx.db.insert(
			"entityFieldDefinitions",
			{
				entityTypeId: appointmentTypeId,
				key: "confirmed",
				label: "Confirmed",
				valueType: "boolean",
				required: false,
				position: 1,
				archivedAt: null,
			},
		);

		const propertyId = await ctx.db.insert("entities", {
			entityTypeId: propertyTypeId,
			identifier: "FAST-2026-318",
			normalizedIdentifier: normalizeEntityIdentifier("FAST-2026-318"),
			displayName: "Storgatan 12",
			createdAt: now - 45 * day,
			updatedAt: now - 2 * 60 * 60 * 1000,
			archivedAt: null,
		});
		await ctx.db.insert("entityTextFieldValues", {
			entityId: propertyId,
			fieldDefinitionId: propertyAddressFieldId,
			value: "Storgatan 12, 114 55 Stockholm",
		});
		await ctx.db.insert("entityTextFieldValues", {
			entityId: propertyId,
			fieldDefinitionId: propertyMunicipalityFieldId,
			value: "Stockholm",
		});
		await ctx.db.insert("entityNumberFieldValues", {
			entityId: propertyId,
			fieldDefinitionId: propertyPriceFieldId,
			value: 8_950_000,
		});

		const contractId = await ctx.db.insert("entities", {
			entityTypeId: contractTypeId,
			identifier: "K-55291",
			normalizedIdentifier: normalizeEntityIdentifier("K-55291"),
			displayName: "Purchase agreement · Storgatan 12",
			createdAt: now - 12 * day,
			updatedAt: now - day,
			archivedAt: null,
		});
		await ctx.db.insert("entityDateFieldValues", {
			entityId: contractId,
			fieldDefinitionId: contractSignedAtFieldId,
			value: now - 11 * day,
		});
		await ctx.db.insert("entityNumberFieldValues", {
			entityId: contractId,
			fieldDefinitionId: contractValueFieldId,
			value: 8_825_000,
		});

		const appointmentId = await ctx.db.insert("entities", {
			entityTypeId: appointmentTypeId,
			identifier: "APT-884",
			normalizedIdentifier: normalizeEntityIdentifier("APT-884"),
			displayName: "Key handover · Storgatan 12",
			createdAt: now - 5 * day,
			updatedAt: now - 2 * 60 * 60 * 1000,
			archivedAt: null,
		});
		await ctx.db.insert("entityDateFieldValues", {
			entityId: appointmentId,
			fieldDefinitionId: appointmentDateFieldId,
			value: now + 3 * day,
		});
		await ctx.db.insert("entityBooleanFieldValues", {
			entityId: appointmentId,
			fieldDefinitionId: appointmentConfirmedFieldId,
			value: true,
		});

		const firstCaseId = await ctx.db.insert("cases", {
			organizationId,
			reference: "CASE-1042",
			title: "Missing keys before possession",
			description:
				"Coordinate the remaining key handover before the buyer takes possession of the property.",
			ownerMemberId: adamId,
			dueAt: now + 3 * day,
			status: "open",
			lastActivityAt: now - 18 * 60 * 1000,
			createdAt: now - 5 * day,
			updatedAt: now - 18 * 60 * 1000,
		});
		const secondCaseId = await ctx.db.insert("cases", {
			organizationId,
			reference: "CASE-1041",
			title: "Contract amendment for Storgatan 12",
			description:
				"Prepare and confirm the amended possession date with all parties.",
			ownerMemberId: saraId,
			dueAt: now + 6 * day,
			status: "open",
			lastActivityAt: now - 5 * 60 * 60 * 1000,
			createdAt: now - 8 * day,
			updatedAt: now - 5 * 60 * 60 * 1000,
		});
		const thirdCaseId = await ctx.db.insert("cases", {
			organizationId,
			reference: "CASE-1039",
			title: "Photography rescheduling",
			description:
				"Reschedule the listing photography after access was unavailable.",
			ownerMemberId: saraId,
			dueAt: null,
			status: "closed",
			lastActivityAt: now - 3 * day,
			createdAt: now - 14 * day,
			updatedAt: now - 3 * day,
		});

		await ctx.db.insert("caseContactRelations", {
			caseId: firstCaseId,
			contactId: elinId,
			startedAt: now - 5 * day,
			endedAt: null,
			addedByMemberId: adamId,
			removedByMemberId: null,
		});
		await ctx.db.insert("caseContactRelations", {
			caseId: firstCaseId,
			contactId: marcusId,
			startedAt: now - 5 * day,
			endedAt: null,
			addedByMemberId: adamId,
			removedByMemberId: null,
		});
		await ctx.db.insert("caseEntityRelations", {
			caseId: firstCaseId,
			entityId: propertyId,
			startedAt: now - 5 * day,
			endedAt: null,
			addedByMemberId: adamId,
			removedByMemberId: null,
		});
		await ctx.db.insert("caseEntityRelations", {
			caseId: firstCaseId,
			entityId: contractId,
			startedAt: now - 5 * day,
			endedAt: null,
			addedByMemberId: adamId,
			removedByMemberId: null,
		});
		await ctx.db.insert("caseEntityRelations", {
			caseId: firstCaseId,
			entityId: appointmentId,
			startedAt: now - 5 * day,
			endedAt: null,
			addedByMemberId: adamId,
			removedByMemberId: null,
		});
		await ctx.db.insert("caseContactRelations", {
			caseId: secondCaseId,
			contactId: elinId,
			startedAt: now - 8 * day,
			endedAt: null,
			addedByMemberId: saraId,
			removedByMemberId: null,
		});
		await ctx.db.insert("caseContactRelations", {
			caseId: secondCaseId,
			contactId: sofiaId,
			startedAt: now - 8 * day,
			endedAt: null,
			addedByMemberId: saraId,
			removedByMemberId: null,
		});
		await ctx.db.insert("caseEntityRelations", {
			caseId: secondCaseId,
			entityId: contractId,
			startedAt: now - 8 * day,
			endedAt: null,
			addedByMemberId: saraId,
			removedByMemberId: null,
		});
		await ctx.db.insert("caseContactRelations", {
			caseId: thirdCaseId,
			contactId: sofiaId,
			startedAt: now - 14 * day,
			endedAt: null,
			addedByMemberId: saraId,
			removedByMemberId: null,
		});

		for (const event of [
			{
				caseId: firstCaseId,
				body: "Buyer confirmed that two keys are still missing.",
				occurredAt: now - 18 * 60 * 1000,
				authorId: adamId,
			},
			{
				caseId: firstCaseId,
				body: "Broker contacted the seller for an updated handover plan.",
				occurredAt: now - day,
				authorId: adamId,
			},
			{
				caseId: firstCaseId,
				body: "Case opened after the handover checklist was reviewed.",
				occurredAt: now - 5 * day,
				authorId: adamId,
			},
			{
				caseId: secondCaseId,
				body: "The buyer accepted the proposed amendment wording.",
				occurredAt: now - 5 * 60 * 60 * 1000,
				authorId: saraId,
			},
			{
				caseId: secondCaseId,
				body: "Draft amendment sent to both parties.",
				occurredAt: now - 2 * day,
				authorId: saraId,
			},
			{
				caseId: thirdCaseId,
				body: "New photography slot confirmed and shared with the seller.",
				occurredAt: now - 3 * day,
				authorId: saraId,
			},
		]) {
			await ctx.db.insert("caseEvents", {
				caseId: event.caseId,
				body: event.body,
				occurredAt: event.occurredAt,
				createdAt: event.occurredAt,
				createdByMemberId: event.authorId,
			});
		}

		return "seeded";
	},
});
