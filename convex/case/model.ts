import { v } from "convex/values";

export const CASE_STATUSES = ["open", "closed"] as const;

export const caseStatusValidator = v.union(
	...CASE_STATUSES.map((status) => v.literal(status)),
);

export type CaseStatus = (typeof CASE_STATUSES)[number];
