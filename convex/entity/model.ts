import { v } from "convex/values";

export const entityIconValidator = v.union(
	v.literal("box"),
	v.literal("user"),
	v.literal("users"),
	v.literal("building"),
	v.literal("briefcase"),
	v.literal("home"),
	v.literal("estate"),
	v.literal("contract"),
	v.literal("invoice"),
	v.literal("shield"),
	v.literal("car"),
	v.literal("truck"),
	v.literal("package"),
	v.literal("paw"),
	v.literal("heartbeat"),
	v.literal("calendar"),
	v.literal("map-pin"),
	v.literal("tools"),
);

export const entityFieldTypeValidator = v.union(
	v.literal("text"),
	v.literal("number"),
	v.literal("boolean"),
	v.literal("date"),
);
