import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { appendCaseEvent } from "./events";

export const MAX_CASE_CONTACT_RELATIONS = 50;
export const MAX_CASE_ENTITY_RELATIONS = 100;

async function requireContact(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	contactId: Id<"contacts">,
) {
	const contact = await ctx.db.get(contactId);
	if (!contact || contact.organizationId !== organizationId) {
		throw new ConvexError({
			code: "INVALID_CONTACT_RELATION",
			message: "A selected contact does not belong to this organization.",
		});
	}
	return contact;
}

async function requireEntity(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	entityId: Id<"entities">,
) {
	const entity = await ctx.db.get(entityId);
	const entityType = entity ? await ctx.db.get(entity.entityTypeId) : null;
	if (
		!entity ||
		entity.archivedAt !== null ||
		!entityType ||
		entityType.organizationId !== organizationId ||
		entityType.archivedAt !== null
	) {
		throw new ConvexError({
			code: "INVALID_ENTITY_RELATION",
			message: "A selected entity does not belong to this organization.",
		});
	}
	return entity;
}

function uniqueWithinLimit<T extends string>(
	values: T[],
	limit: number,
	label: string,
) {
	const uniqueValues = [...new Set(values)];
	if (uniqueValues.length > limit) {
		throw new ConvexError({
			code: "TOO_MANY_RELATIONS",
			message: `A case can have at most ${limit} ${label}.`,
		});
	}
	return uniqueValues;
}

export async function validateInitialRelations(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	contactIds: Id<"contacts">[],
	entityIds: Id<"entities">[],
) {
	const contacts = uniqueWithinLimit(
		contactIds,
		MAX_CASE_CONTACT_RELATIONS,
		"contacts",
	);
	const entities = uniqueWithinLimit(
		entityIds,
		MAX_CASE_ENTITY_RELATIONS,
		"entity relations",
	);

	await Promise.all([
		...contacts.map((contactId) =>
			requireContact(ctx, organizationId, contactId),
		),
		...entities.map((entityId) => requireEntity(ctx, organizationId, entityId)),
	]);
	return { contactIds: contacts, entityIds: entities };
}

export async function insertInitialRelations(
	ctx: MutationCtx,
	caseId: Id<"cases">,
	actorMemberId: Id<"organizationMembers">,
	contactIds: Id<"contacts">[],
	entityIds: Id<"entities">[],
	startedAt: number,
) {
	for (const contactId of contactIds) {
		await ctx.db.insert("caseContactRelations", {
			caseId,
			contactId,
			startedAt,
			endedAt: null,
			addedByMemberId: actorMemberId,
			removedByMemberId: null,
		});
	}
	for (const entityId of entityIds) {
		await ctx.db.insert("caseEntityRelations", {
			caseId,
			entityId,
			startedAt,
			endedAt: null,
			addedByMemberId: actorMemberId,
			removedByMemberId: null,
		});
	}
}

export async function addContactCaseRelation(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	caseRecord: Doc<"cases">,
	contactId: Id<"contacts">,
	actorMemberId: Id<"organizationMembers">,
) {
	const contact = await requireContact(ctx, organizationId, contactId);
	const existing = await ctx.db
		.query("caseContactRelations")
		.withIndex("by_case_id_and_contact_id_and_ended_at", (index) =>
			index
				.eq("caseId", caseRecord._id)
				.eq("contactId", contact._id)
				.eq("endedAt", null),
		)
		.unique();
	if (existing) {
		return existing._id;
	}

	const activeRelations = await ctx.db
		.query("caseContactRelations")
		.withIndex("by_case_id_and_ended_at", (index) =>
			index.eq("caseId", caseRecord._id).eq("endedAt", null),
		)
		.take(MAX_CASE_CONTACT_RELATIONS);
	if (activeRelations.length >= MAX_CASE_CONTACT_RELATIONS) {
		throw new ConvexError({
			code: "TOO_MANY_RELATIONS",
			message: `A case can have at most ${MAX_CASE_CONTACT_RELATIONS} contacts.`,
		});
	}

	const now = Date.now();
	const relationId = await ctx.db.insert("caseContactRelations", {
		caseId: caseRecord._id,
		contactId: contact._id,
		startedAt: now,
		endedAt: null,
		addedByMemberId: actorMemberId,
		removedByMemberId: null,
	});
	await appendCaseEvent(
		ctx,
		caseRecord,
		`Added ${contact.name || contact.address} as a contact.`,
		actorMemberId,
		now,
	);
	return relationId;
}

export async function removeContactCaseRelation(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	relationId: Id<"caseContactRelations">,
	actorMemberId: Id<"organizationMembers">,
) {
	const relation = await ctx.db.get(relationId);
	if (!relation || relation.endedAt !== null) {
		return;
	}
	const caseRecord = await ctx.db.get(relation.caseId);
	if (!caseRecord || caseRecord.organizationId !== organizationId) {
		throw new ConvexError({
			code: "CASE_NOT_FOUND",
			message: "The case could not be found.",
		});
	}
	const contact = await ctx.db.get(relation.contactId);
	const now = Date.now();
	await ctx.db.patch("caseContactRelations", relation._id, {
		endedAt: now,
		removedByMemberId: actorMemberId,
	});
	await appendCaseEvent(
		ctx,
		caseRecord,
		`Removed ${contact?.name || contact?.address || "a contact"} from the case.`,
		actorMemberId,
		now,
	);
}

export async function addEntityCaseRelation(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	caseRecord: Doc<"cases">,
	entityId: Id<"entities">,
	actorMemberId: Id<"organizationMembers">,
) {
	const entity = await requireEntity(ctx, organizationId, entityId);
	const existing = await ctx.db
		.query("caseEntityRelations")
		.withIndex("by_case_id_and_entity_id_and_ended_at", (index) =>
			index
				.eq("caseId", caseRecord._id)
				.eq("entityId", entity._id)
				.eq("endedAt", null),
		)
		.unique();
	if (existing) {
		return existing._id;
	}

	const activeRelations = await ctx.db
		.query("caseEntityRelations")
		.withIndex("by_case_id_and_ended_at", (index) =>
			index.eq("caseId", caseRecord._id).eq("endedAt", null),
		)
		.take(MAX_CASE_ENTITY_RELATIONS);
	if (activeRelations.length >= MAX_CASE_ENTITY_RELATIONS) {
		throw new ConvexError({
			code: "TOO_MANY_RELATIONS",
			message: `A case can have at most ${MAX_CASE_ENTITY_RELATIONS} entity relations.`,
		});
	}

	const now = Date.now();
	const relationId = await ctx.db.insert("caseEntityRelations", {
		caseId: caseRecord._id,
		entityId: entity._id,
		startedAt: now,
		endedAt: null,
		addedByMemberId: actorMemberId,
		removedByMemberId: null,
	});
	await appendCaseEvent(
		ctx,
		caseRecord,
		`Added ${entity.displayName} as a related entity.`,
		actorMemberId,
		now,
	);
	return relationId;
}

export async function removeEntityCaseRelation(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	relationId: Id<"caseEntityRelations">,
	actorMemberId: Id<"organizationMembers">,
) {
	const relation = await ctx.db.get(relationId);
	if (!relation || relation.endedAt !== null) {
		return;
	}
	const caseRecord = await ctx.db.get(relation.caseId);
	if (!caseRecord || caseRecord.organizationId !== organizationId) {
		throw new ConvexError({
			code: "CASE_NOT_FOUND",
			message: "The case could not be found.",
		});
	}
	const entity = await ctx.db.get(relation.entityId);
	const now = Date.now();
	await ctx.db.patch("caseEntityRelations", relation._id, {
		endedAt: now,
		removedByMemberId: actorMemberId,
	});
	await appendCaseEvent(
		ctx,
		caseRecord,
		`Removed ${entity?.displayName || "an entity"} from the case.`,
		actorMemberId,
		now,
	);
}
