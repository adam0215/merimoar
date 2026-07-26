import { v } from "convex/values";

export const CASE_STATUSES = ["open", "closed"] as const;

export const caseStatusValidator = v.union(
	v.literal("open"),
	v.literal("closed"),
);

export type CaseStatus = (typeof CASE_STATUSES)[number];
