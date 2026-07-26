import { ConvexError, v } from "convex/values";
import { z } from "zod";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { mutation } from "../_generated/server";
import { requireActor } from "../auth/access";
import { requireCase, validateCaseOwner } from "./access";
import { appendCaseEvent } from "./events";
import { CASE_STATUSES } from "./model";
import {
	addContactCaseRelation,
	addEntityCaseRelation,
	insertInitialRelations,
	removeContactCaseRelation,
	removeEntityCaseRelation,
	validateInitialRelations,
} from "./relations";

const caseDetailsSchema = z.object({
	title: z.string().trim().min(2).max(160),
	description: z.string().trim().max(4000),
	dueAt: z.number().finite().nullable(),
	status: z.enum(CASE_STATUSES),
});
const eventBodySchema = z.string().trim().min(1).max(4000);

function invalidCase(message: string) {
	return new ConvexError({ code: "INVALID_CASE", message });
}

async function generateCaseReference(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
) {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const reference = `CASE-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
		const existing = await ctx.db
			.query("cases")
			.withIndex("by_organization_id_and_reference", (index) =>
				index.eq("organizationId", organizationId).eq("reference", reference),
			)
			.unique();
		if (!existing) {
			return reference;
		}
	}
	throw new Error("Could not generate a unique case reference");
}

export const create = mutation({
	args: {
		title: v.string(),
		description: v.string(),
		ownerMemberId: v.union(v.id("organizationMembers"), v.null()),
		dueAt: v.union(v.number(), v.null()),
		initialEventBody: v.string(),
		contactIds: v.array(v.id("contacts")),
		entityIds: v.array(v.id("entities")),
	},
	returns: v.id("cases"),
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		const details = caseDetailsSchema.safeParse({
			...args,
			status: "open",
		});
		if (!details.success) {
			throw invalidCase(
				details.error.issues[0]?.message ?? "Enter valid case details.",
			);
		}

		const initialEventBody = args.initialEventBody.trim();
		const initialEvent = initialEventBody
			? eventBodySchema.safeParse(initialEventBody)
			: null;
		if (initialEvent && !initialEvent.success) {
			throw new ConvexError({
				code: "INVALID_CASE_EVENT",
				message:
					initialEvent.error.issues[0]?.message ?? "Enter a valid event.",
			});
		}

		await validateCaseOwner(ctx, actor.organization._id, args.ownerMemberId);
		const [relations, reference] = await Promise.all([
			validateInitialRelations(
				ctx,
				actor.organization._id,
				args.contactIds,
				args.entityIds,
			),
			generateCaseReference(ctx, actor.organization._id),
		]);

		const now = Date.now();
		const caseId = await ctx.db.insert("cases", {
			organizationId: actor.organization._id,
			reference,
			title: details.data.title,
			description: details.data.description,
			ownerMemberId: args.ownerMemberId,
			dueAt: details.data.dueAt,
			status: "open",
			lastActivityAt: now,
			createdAt: now,
			updatedAt: now,
		});

		await insertInitialRelations(
			ctx,
			caseId,
			actor.member._id,
			relations.contactIds,
			relations.entityIds,
			now,
		);
		if (initialEvent?.success) {
			await ctx.db.insert("caseEvents", {
				caseId,
				body: initialEvent.data,
				occurredAt: now,
				createdAt: now,
				createdByMemberId: actor.member._id,
			});
		}
		return caseId;
	},
});

export const update = mutation({
	args: {
		caseId: v.id("cases"),
		title: v.string(),
		description: v.string(),
		ownerMemberId: v.union(v.id("organizationMembers"), v.null()),
		dueAt: v.union(v.number(), v.null()),
		status: v.union(v.literal("open"), v.literal("closed")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		const details = caseDetailsSchema.safeParse(args);
		if (!details.success) {
			throw invalidCase(
				details.error.issues[0]?.message ?? "Enter valid case details.",
			);
		}

		const caseRecord = await requireCase(
			ctx,
			actor.organization._id,
			args.caseId,
		);
		await validateCaseOwner(ctx, actor.organization._id, args.ownerMemberId);

		const now = Date.now();
		const statusChanged = caseRecord.status !== details.data.status;
		await ctx.db.patch("cases", caseRecord._id, {
			title: details.data.title,
			description: details.data.description,
			ownerMemberId: args.ownerMemberId,
			dueAt: details.data.dueAt,
			status: details.data.status,
			updatedAt: now,
			lastActivityAt: statusChanged ? now : caseRecord.lastActivityAt,
		});
		if (statusChanged) {
			await appendCaseEvent(
				ctx,
				caseRecord,
				details.data.status === "closed" ? "Case closed." : "Case reopened.",
				actor.member._id,
				now,
			);
		}
		return null;
	},
});

export const addEvent = mutation({
	args: {
		caseId: v.id("cases"),
		body: v.string(),
	},
	returns: v.id("caseEvents"),
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		const body = eventBodySchema.safeParse(args.body);
		if (!body.success) {
			throw new ConvexError({
				code: "INVALID_CASE_EVENT",
				message: body.error.issues[0]?.message ?? "Enter a valid event.",
			});
		}
		const caseRecord = await requireCase(
			ctx,
			actor.organization._id,
			args.caseId,
		);
		return await appendCaseEvent(ctx, caseRecord, body.data, actor.member._id);
	},
});

export const addContactRelation = mutation({
	args: {
		caseId: v.id("cases"),
		contactId: v.id("contacts"),
	},
	returns: v.id("caseContactRelations"),
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		const caseRecord = await requireCase(
			ctx,
			actor.organization._id,
			args.caseId,
		);
		return await addContactCaseRelation(
			ctx,
			actor.organization._id,
			caseRecord,
			args.contactId,
			actor.member._id,
		);
	},
});

export const removeContactRelation = mutation({
	args: {
		relationId: v.id("caseContactRelations"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		await removeContactCaseRelation(
			ctx,
			actor.organization._id,
			args.relationId,
			actor.member._id,
		);
		return null;
	},
});

export const addEntityRelation = mutation({
	args: {
		caseId: v.id("cases"),
		entityId: v.id("entities"),
	},
	returns: v.id("caseEntityRelations"),
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		const caseRecord = await requireCase(
			ctx,
			actor.organization._id,
			args.caseId,
		);
		return await addEntityCaseRelation(
			ctx,
			actor.organization._id,
			caseRecord,
			args.entityId,
			actor.member._id,
		);
	},
});

export const removeEntityRelation = mutation({
	args: {
		relationId: v.id("caseEntityRelations"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const actor = await requireActor(ctx);
		await removeEntityCaseRelation(
			ctx,
			actor.organization._id,
			args.relationId,
			actor.member._id,
		);
		return null;
	},
});
