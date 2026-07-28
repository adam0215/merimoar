import { Migrations } from "@convex-dev/migrations";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";

const migrations = new Migrations<DataModel>(components.migrations);

export const typeLegacyCaseEventsAsHumanNotes = migrations.define({
	table: "caseEvents",
	migrateOne: async (ctx, event) => {
		if (!("type" in event)) {
			await ctx.db.patch("caseEvents", event._id, {
				type: "human_note",
			});
		}
	},
});

export const verifyTypedCaseEvents = internalQuery({
	args: {},
	returns: v.object({
		complete: v.boolean(),
		sampleLegacyEventIds: v.array(v.id("caseEvents")),
	}),
	handler: async (ctx) => {
		const legacyEvents = await ctx.db
			.query("caseEvents")
			.withIndex("by_type", (index) => index.eq("type", undefined))
			.take(10);
		return {
			complete: legacyEvents.length === 0,
			sampleLegacyEventIds: legacyEvents.map((event) => event._id),
		};
	},
});
