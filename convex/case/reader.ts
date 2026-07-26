import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { query } from "../_generated/server";
import { requireActor } from "../auth/access";
import {
	MAX_ENTITIES_PER_TYPE,
	MAX_ENTITY_TYPES_PER_ORGANIZATION,
} from "../entity/constants";
import { getWorkosUser } from "../workos";
import {
	MAX_CASE_CONTACT_RELATIONS,
	MAX_CASE_ENTITY_RELATIONS,
} from "./relations";

const MAX_CASE_EVENTS = 100;
const MAX_ORGANIZATION_MEMBERS = 50;
const MAX_CONTACT_OPTIONS = 50;

function getUserName(
	user: NonNullable<Awaited<ReturnType<typeof getWorkosUser>>>,
) {
	return (
		user.name?.trim() ||
		[user.firstName, user.lastName].filter(Boolean).join(" ") ||
		user.email
	);
}

async function resolveMember(
	ctx: Pick<QueryCtx, "db" | "runQuery">,
	memberId: Id<"organizationMembers">,
) {
	const member = await ctx.db.get(memberId);
	if (!member) {
		return null;
	}
	const user = await getWorkosUser(ctx, member.workosUserId);
	return {
		...member,
		name: user ? getUserName(user) : "Former member",
		email: user?.email ?? "",
	};
}

async function resolveActiveMember(
	ctx: Pick<QueryCtx, "runQuery">,
	member: Doc<"organizationMembers">,
) {
	const user = await getWorkosUser(ctx, member.workosUserId);
	if (!user) {
		return null;
	}
	return {
		...member,
		name: getUserName(user),
		email: user.email,
	};
}

export const list = query({
	args: {
		paginationOpts: paginationOptsValidator,
	},
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		const result = await ctx.db
			.query("cases")
			.withIndex("by_organization_id_and_last_activity_at", (index) =>
				index.eq("organizationId", workspace.organization._id),
			)
			.order("desc")
			.paginate(args.paginationOpts);

		return {
			...result,
			page: await Promise.all(
				result.page.map(async (caseRecord) => ({
					case: caseRecord,
					owner: caseRecord.ownerMemberId
						? await resolveMember(ctx, caseRecord.ownerMemberId)
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
		const workspace = await requireActor(ctx);
		const caseId = ctx.db.normalizeId("cases", args.caseId);
		if (!caseId) {
			return null;
		}

		const caseRecord = await ctx.db.get(caseId);
		if (
			!caseRecord ||
			caseRecord.organizationId !== workspace.organization._id
		) {
			return null;
		}

		const [owner, events, contactRelations, entityRelations] =
			await Promise.all([
				caseRecord.ownerMemberId
					? resolveMember(ctx, caseRecord.ownerMemberId)
					: null,
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
						? await resolveMember(ctx, event.createdByMemberId)
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
		const workspace = await requireActor(ctx);
		const [memberDocuments, contacts, entityTypes] = await Promise.all([
			ctx.db
				.query("organizationMembers")
				.withIndex("by_organization_id_and_active", (index) =>
					index
						.eq("organizationId", workspace.organization._id)
						.eq("active", true),
				)
				.take(MAX_ORGANIZATION_MEMBERS),
			ctx.db
				.query("contacts")
				.withIndex("by_organization_id_and_last_seen_at", (index) =>
					index.eq("organizationId", workspace.organization._id),
				)
				.order("desc")
				.take(MAX_CONTACT_OPTIONS),
			ctx.db
				.query("entityTypes")
				.withIndex("by_organization_id_and_archived_at_and_name", (index) =>
					index
						.eq("organizationId", workspace.organization._id)
						.eq("archivedAt", null),
				)
				.take(MAX_ENTITY_TYPES_PER_ORGANIZATION),
		]);

		const members = (
			await Promise.all(
				memberDocuments.map((member) => resolveActiveMember(ctx, member)),
			)
		)
			.filter((member) => member !== null)
			.sort((left, right) => left.name.localeCompare(right.name));

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
