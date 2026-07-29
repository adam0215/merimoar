import { v } from "convex/values";

export const CASE_STATUSES = [
	"needs_attention",
	"waiting",
	"clear",
	"open",
	"closed",
] as const;

export const caseStatusValidator = v.union(
	...CASE_STATUSES.map((status) => v.literal(status)),
);

export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
	needs_attention: "Needs attention",
	waiting: "Waiting",
	clear: "Clear",
	open: "Open",
	closed: "Closed",
};

export const CASE_VIEW_FILTERS = [
	"assigned_to_me",
	"unassigned",
	"all_open",
	"overdue",
	"needs_attention",
	"waiting",
	"closed",
] as const;

export const CASE_VIEWS = ["all", ...CASE_VIEW_FILTERS] as const;

export type CaseView = (typeof CASE_VIEWS)[number];
export type CaseViewFilter = (typeof CASE_VIEW_FILTERS)[number];

export const caseViewFilterValidator = v.union(
	...CASE_VIEW_FILTERS.map((view) => v.literal(view)),
);

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
		type: v.literal("outbound_email"),
		emailMessageId: v.id("emailMessages"),
	}),
	caseEventBaseValidator.extend({
		type: v.literal("system_change"),
		body: v.string(),
	}),
);
