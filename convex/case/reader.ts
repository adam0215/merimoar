import {
	type PaginationOptions,
	type PaginationResult,
	paginationOptsValidator,
} from "convex/server";
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
	listActiveEmailThreadRelationsForCase,
	MAX_EMAIL_THREADS_PER_CASE,
} from "./emailRelations";
import { type CaseView, caseViewFilterValidator } from "./model";
import {
	listActiveCaseRelations,
	MAX_CASE_CONTACT_RELATIONS,
	MAX_CASE_ENTITY_RELATIONS,
} from "./relations";

const MAX_CASE_EVENTS = 100;
const MAX_ORGANIZATION_MEMBERS = 50;
const MAX_CONTACT_OPTIONS = 50;
const MAX_CASE_OPTIONS = 100;
const RECENT_CASES_LIMIT = 5;
const OVERVIEW_ASSIGNED_CASE_COUNT_LIMIT = 100;

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

async function paginateCasesForView(
	ctx: Pick<QueryCtx, "db">,
	organizationId: Id<"organizations">,
	memberId: Id<"organizationMembers">,
	view: CaseView,
	now: number | undefined,
	paginationOpts: PaginationOptions,
): Promise<PaginationResult<Doc<"cases">>> {
	switch (view) {
		case "all":
			return await ctx.db
				.query("cases")
				.withIndex("by_organization_id_and_last_activity_at", (index) =>
					index.eq("organizationId", organizationId),
				)
				.order("desc")
				.paginate(paginationOpts);
		case "needs_attention":
		case "waiting":
		case "closed":
			return await ctx.db
				.query("cases")
				.withIndex(
					"by_organization_id_and_status_and_last_activity_at",
					(index) =>
						index.eq("organizationId", organizationId).eq("status", view),
				)
				.order("desc")
				.paginate(paginationOpts);
		case "assigned_to_me":
		case "unassigned":
			return await ctx.db
				.query("cases")
				.withIndex(
					"by_organization_id_and_owner_member_id_and_last_activity_at",
					(index) =>
						index
							.eq("organizationId", organizationId)
							.eq("ownerMemberId", view === "assigned_to_me" ? memberId : null),
				)
				.filter((filter) => filter.neq(filter.field("status"), "closed"))
				.order("desc")
				.paginate(paginationOpts);
		case "overdue":
			if (now === undefined) {
				throw new Error("Overdue cases require the current time");
			}
			return await ctx.db
				.query("cases")
				.withIndex("by_organization_id_and_due_at", (index) =>
					index
						.eq("organizationId", organizationId)
						.gt("dueAt", null)
						.lt("dueAt", now),
				)
				.filter((filter) => filter.neq(filter.field("status"), "closed"))
				.order("asc")
				.paginate(paginationOpts);
		case "all_open":
			return await ctx.db
				.query("cases")
				.withIndex("by_organization_id_and_last_activity_at", (index) =>
					index.eq("organizationId", organizationId),
				)
				.filter((filter) => filter.neq(filter.field("status"), "closed"))
				.order("desc")
				.paginate(paginationOpts);
	}
}

export const list = query({
	args: {
		paginationOpts: paginationOptsValidator,
		view: v.optional(caseViewFilterValidator),
		now: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		const view = args.view ?? "all";
		const result = await paginateCasesForView(
			ctx,
			workspace.organization._id,
			workspace.member._id,
			view,
			args.now,
			args.paginationOpts,
		);

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

export const listRecent = query({
	args: {},
	handler: async (ctx) => {
		const workspace = await requireActor(ctx);
		return await ctx.db
			.query("cases")
			.withIndex("by_organization_id_and_last_activity_at", (index) =>
				index.eq("organizationId", workspace.organization._id),
			)
			.order("desc")
			.take(RECENT_CASES_LIMIT);
	},
});

export const getMyOverviewStats = query({
	args: {},
	handler: async (ctx) => {
		const workspace = await requireActor(ctx);
		const assignedCases = await ctx.db
			.query("cases")
			.withIndex(
				"by_organization_id_and_owner_member_id_and_last_activity_at",
				(index) =>
					index
						.eq("organizationId", workspace.organization._id)
						.eq("ownerMemberId", workspace.member._id),
			)
			.filter((filter) => filter.neq(filter.field("status"), "closed"))
			.order("desc")
			.take(OVERVIEW_ASSIGNED_CASE_COUNT_LIMIT);

		return {
			assignedCaseCount: Math.min(assignedCases.length, 99),
			hasMoreThan99AssignedCases: assignedCases.length > 99,
			latestCaseActivityAt: assignedCases[0]?.lastActivityAt ?? null,
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

		const caseRelationsPromise = listActiveCaseRelations(ctx, caseRecord._id);

		const [
			owner,
			events,
			contactRelations,
			entityRelations,
			emailThreadRelations,
		] = await Promise.all([
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
			listActiveEmailThreadRelationsForCase(ctx, caseRecord._id),
		]);
		const caseRelations = await caseRelationsPromise;
		const relatedCasesPromise = Promise.all(
			caseRelations.map(async (relation) => ({
				relation,
				relatedCase: await ctx.db.get(
					relation.caseId === caseRecord._id
						? relation.relatedCaseId
						: relation.caseId,
				),
			})),
		);
		const emailThreadsPromise = Promise.all(
			emailThreadRelations
				.slice(0, MAX_EMAIL_THREADS_PER_CASE)
				.map(async (relation) => {
					const thread = await ctx.db.get(relation.threadId);
					if (!thread || thread.organizationId !== workspace.organization._id) {
						return { relation, thread: null, latestMessage: null };
					}
					return {
						relation,
						thread,
						latestMessage: thread?.latestMessageId
							? await ctx.db.get(thread.latestMessageId)
							: null,
					};
				}),
		);

		const [resolvedEvents, contacts, entities] = await Promise.all([
			Promise.all(
				events.map(async (event) => ({
					event,
					author: event.createdByMemberId
						? await resolveMember(ctx, event.createdByMemberId)
						: null,
					emailMessage:
						"type" in event &&
						(event.type === "inbound_email" || event.type === "outbound_email")
							? await ctx.db.get(event.emailMessageId)
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
		const [relatedCases, emailThreads] = await Promise.all([
			relatedCasesPromise,
			emailThreadsPromise,
		]);

		return {
			case: caseRecord,
			owner,
			events: resolvedEvents,
			contacts: contacts.filter((item) => item.contact !== null),
			entities: entities.filter(
				(item) => item.entity !== null && item.entityType !== null,
			),
			relatedCases: relatedCases.filter((item) => item.relatedCase !== null),
			emailThreads: emailThreads.filter((item) => item.thread !== null),
		};
	},
});

export const getCreateOptions = query({
	args: {},
	handler: async (ctx) => {
		const workspace = await requireActor(ctx);
		const caseOptionsPromise = ctx.db
			.query("cases")
			.withIndex("by_organization_id_and_last_activity_at", (index) =>
				index.eq("organizationId", workspace.organization._id),
			)
			.order("desc")
			.take(MAX_CASE_OPTIONS);
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
		const caseOptions = await caseOptionsPromise;

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
			cases: caseOptions,
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
