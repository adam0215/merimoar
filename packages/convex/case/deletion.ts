import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

async function deleteAgentTaskGraph(
	ctx: MutationCtx,
	taskId: Id<"agentTasks">,
) {
	for await (const turn of ctx.db
		.query("agentTurns")
		.withIndex("by_task_id_and_sequence", (index) =>
			index.eq("taskId", taskId),
		)) {
		for await (const run of ctx.db
			.query("agentRuns")
			.withIndex("by_turn_id_and_requested_at", (index) =>
				index.eq("turnId", turn._id),
			)) {
			for await (const definition of ctx.db
				.query("agentRunCustomToolDefinitions")
				.withIndex("by_run_id", (index) => index.eq("runId", run._id))) {
				await ctx.db.delete("agentRunCustomToolDefinitions", definition._id);
			}
			await ctx.db.delete("agentRuns", run._id);
		}

		for await (const item of ctx.db
			.query("agentItems")
			.withIndex("by_turn_id_and_sequence", (index) =>
				index.eq("turnId", turn._id),
			)) {
			await ctx.db.delete("agentItems", item._id);
		}
		await ctx.db.delete("agentTurns", turn._id);
	}

	await ctx.db.delete("agentTasks", taskId);
}

export async function deleteCaseAndDependents(
	ctx: MutationCtx,
	caseRecord: Doc<"cases">,
) {
	const caseId = caseRecord._id;
	for await (const task of ctx.db
		.query("agentTasks")
		.withIndex("by_anchor_case_id_and_requested_at", (index) =>
			index.eq("anchorCaseId", caseId),
		)) {
		await deleteAgentTaskGraph(ctx, task._id);
	}

	for await (const event of ctx.db
		.query("caseEvents")
		.withIndex("by_case_id_and_occurred_at", (index) =>
			index.eq("caseId", caseId),
		)) {
		await ctx.db.delete("caseEvents", event._id);
	}

	for await (const relation of ctx.db
		.query("caseContactRelations")
		.withIndex("by_case_id_and_ended_at", (index) =>
			index.eq("caseId", caseId),
		)) {
		await ctx.db.delete("caseContactRelations", relation._id);
	}

	for await (const relation of ctx.db
		.query("caseEntityRelations")
		.withIndex("by_case_id_and_ended_at", (index) =>
			index.eq("caseId", caseId),
		)) {
		await ctx.db.delete("caseEntityRelations", relation._id);
	}

	for await (const relation of ctx.db
		.query("caseCaseRelations")
		.withIndex("by_case_id_and_ended_at", (index) =>
			index.eq("caseId", caseId),
		)) {
		await ctx.db.delete("caseCaseRelations", relation._id);
	}
	for await (const relation of ctx.db
		.query("caseCaseRelations")
		.withIndex("by_related_case_id_and_ended_at", (index) =>
			index.eq("relatedCaseId", caseId),
		)) {
		await ctx.db.delete("caseCaseRelations", relation._id);
	}

	for await (const relation of ctx.db
		.query("caseEmailThreadRelations")
		.withIndex("by_case_id_and_ended_at", (index) =>
			index.eq("caseId", caseId),
		)) {
		await ctx.db.delete("caseEmailThreadRelations", relation._id);
	}

	for await (const embedding of ctx.db
		.query("caseEmbeddings")
		.withIndex("by_case_id", (index) => index.eq("caseId", caseId))) {
		await ctx.db.delete("caseEmbeddings", embedding._id);
	}

	if (caseRecord.globalSearchEntryId) {
		await ctx.db.delete("globalSearchEntries", caseRecord.globalSearchEntryId);
	}
	await ctx.db.delete("cases", caseId);
}
