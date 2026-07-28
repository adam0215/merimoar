import { v } from "convex/values";

export const CASE_STATUSES = ["open", "closed"] as const;

export const caseStatusValidator = v.union(
	...CASE_STATUSES.map((status) => v.literal(status)),
);

export type CaseStatus = (typeof CASE_STATUSES)[number];

const caseEventBaseValidator = v.object({
	caseId: v.id("cases"),
	occurredAt: v.number(),
	createdAt: v.number(),
	createdByMemberId: v.union(v.id("organizationMembers"), v.null()),
});

export const caseEventValidator = v.union(
	// Deprecated legacy shape. Keep it readable until the production backfill
	// has completed, then narrow the schema to the typed variants below.
	caseEventBaseValidator.extend({
		body: v.string(),
	}),
	caseEventBaseValidator.extend({
		type: v.literal("human_note"),
		body: v.string(),
	}),
	caseEventBaseValidator.extend({
		type: v.literal("inbound_email"),
		emailMessageId: v.id("emailMessages"),
	}),
	caseEventBaseValidator.extend({
		type: v.literal("system_change"),
		body: v.string(),
	}),
);
