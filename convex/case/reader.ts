import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireActor } from "../auth/access";
import {
	MAX_ENTITIES_PER_TYPE,
	MAX_ENTITY_TYPES_PER_ORGANIZATION,
} from "../entity/constants";
import {
	MAX_CASE_CONTACT_RELATIONS,
	MAX_CASE_ENTITY_RELATIONS,
} from "./relations";

const MAX_CASE_EVENTS = 100;
const MAX_ORGANIZATION_MEMBERS = 50;
const MAX_CONTACT_OPTIONS = 50;

export const list = query({
	args: {
		paginationOpts: paginationOptsValidator,
	},
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		const result = await ctx.db
			.query("cases")
			.withIndex("by_organization_id_and_last_activity_at", (index) =>
				index.eq("organizationId", actor.organization._id),
			)
			.order("desc")
			.paginate(args.paginationOpts);

		return {
			...result,
			page: await Promise.all(
				result.page.map(async (caseRecord) => ({
					case: caseRecord,
					owner: caseRecord.ownerMemberId
						? await ctx.db.get(caseRecord.ownerMemberId)
						: null,
				})),
			),
		};
	},
});

export const get = query({
	args: {
		caseId: v.string(),
	},
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		const caseId = ctx.db.normalizeId("cases", args.caseId);
		if (!caseId) {
			return null;
		}

		const caseRecord = await ctx.db.get(caseId);
		if (!caseRecord || caseRecord.organizationId !== actor.organization._id) {
			return null;
		}

		const [owner, events, contactRelations, entityRelations] =
			await Promise.all([
				caseRecord.ownerMemberId ? ctx.db.get(caseRecord.ownerMemberId) : null,
				ctx.db
					.query("caseEvents")
					.withIndex("by_case_id_and_occurred_at", (index) =>
						index.eq("caseId", caseRecord._id),
					)
					.order("desc")
					.take(MAX_CASE_EVENTS),
				ctx.db
					.query("caseContactRelations")
					.withIndex("by_case_id_and_ended_at", (index) =>
						index.eq("caseId", caseRecord._id).eq("endedAt", null),
					)
					.take(MAX_CASE_CONTACT_RELATIONS),
				ctx.db
					.query("caseEntityRelations")
					.withIndex("by_case_id_and_ended_at", (index) =>
						index.eq("caseId", caseRecord._id).eq("endedAt", null),
					)
					.take(MAX_CASE_ENTITY_RELATIONS),
			]);

		const [resolvedEvents, contacts, entities] = await Promise.all([
			Promise.all(
				events.map(async (event) => ({
					event,
					author: event.createdByMemberId
						? await ctx.db.get(event.createdByMemberId)
						: null,
				})),
			),
			Promise.all(
				contactRelations.map(async (relation) => ({
					relation,
					contact: await ctx.db.get(relation.contactId),
				})),
			),
			Promise.all(
				entityRelations.map(async (relation) => {
					const entity = await ctx.db.get(relation.entityId);
					const entityType = entity
						? await ctx.db.get(entity.entityTypeId)
						: null;
					return { relation, entity, entityType };
				}),
			),
		]);

		return {
			case: caseRecord,
			owner,
			events: resolvedEvents,
			contacts: contacts.filter((item) => item.contact !== null),
			entities: entities.filter(
				(item) => item.entity !== null && item.entityType !== null,
			),
		};
	},
});

export const getCreateOptions = query({
	args: {},
	handler: async (ctx) => {
		const actor = await requireActor(ctx);
		const [members, contacts, entityTypes] = await Promise.all([
			ctx.db
				.query("organizationMembers")
				.withIndex("by_organization_id_and_status_and_name", (index) =>
					index
						.eq("organizationId", actor.organization._id)
						.eq("status", "active"),
				)
				.take(MAX_ORGANIZATION_MEMBERS),
			ctx.db
				.query("contacts")
				.withIndex("by_organization_id_and_last_seen_at", (index) =>
					index.eq("organizationId", actor.organization._id),
				)
				.order("desc")
				.take(MAX_CONTACT_OPTIONS),
			ctx.db
				.query("entityTypes")
				.withIndex("by_organization_id_and_archived_at_and_name", (index) =>
					index
						.eq("organizationId", actor.organization._id)
						.eq("archivedAt", null),
				)
				.take(MAX_ENTITY_TYPES_PER_ORGANIZATION),
		]);

		return {
			members,
			contacts,
			entityTypes: await Promise.all(
				entityTypes.map(async (entityType) => ({
					entityType,
					entities: await ctx.db
						.query("entities")
						.withIndex(
							"by_entity_type_id_and_archived_at_and_display_name",
							(index) =>
								index.eq("entityTypeId", entityType._id).eq("archivedAt", null),
						)
						.take(MAX_ENTITIES_PER_TYPE),
				})),
			),
		};
	},
});
