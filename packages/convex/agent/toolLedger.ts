import { ConvexError } from "convex/values";
import { requireClaimedAgentRun } from "#/agent/access";
import { canonicalCasePair } from "#/case/relations";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

const MAX_TOOL_CALL_ID_LENGTH = 200;

function invalidToolLedger(message: string) {
	return new ConvexError({ code: "INVALID_AGENT_TOOL_INPUT", message });
}

export async function requireRunOrganization(
	ctx: MutationCtx,
	args: {
		runId: Id<"agentRuns">;
		claimToken: string;
	},
) {
	const runtime = await requireClaimedAgentRun(ctx, args);
	return {
		...runtime,
		organizationId: runtime.anchorCase.organizationId,
	};
}

export async function requireMutatingToolLedger(
	ctx: MutationCtx,
	args: {
		runId: Id<"agentRuns">;
		claimToken: string;
		toolCallId: string;
	},
	toolName: string,
) {
	const runtime = await requireRunOrganization(ctx, args);
	if (!args.toolCallId || args.toolCallId.length > MAX_TOOL_CALL_ID_LENGTH) {
		throw invalidToolLedger(
			`Tool call ID must contain 1 to ${MAX_TOOL_CALL_ID_LENGTH} characters.`,
		);
	}
	const item = await ctx.db
		.query("agentItems")
		.withIndex("by_run_id_and_tool_call_id", (index) =>
			index.eq("runId", args.runId).eq("toolCallId", args.toolCallId),
		)
		.unique();
	if (
		!item ||
		item.kind !== "tool" ||
		item.toolName !== toolName ||
		item.turnId !== runtime.turn._id
	) {
		throw invalidToolLedger("The mutating tool call was not durably started.");
	}
	return { ...runtime, item };
}

export async function commitMutatingToolResult(
	ctx: MutationCtx,
	item: Extract<Doc<"agentItems">, { kind: "tool" }>,
	output: string | null,
) {
	const outputJson = JSON.stringify(output);
	await ctx.db.replace("agentItems", item._id, {
		turnId: item.turnId,
		sequence: item.sequence,
		createdAt: item.createdAt,
		kind: "tool",
		runId: item.runId,
		toolCallId: item.toolCallId,
		toolName: item.toolName,
		inputJson: item.inputJson,
		summary: item.summary,
		status: "completed",
		outputJson,
	});
}

export function requireCompletedToolOutput(
	item: Extract<Doc<"agentItems">, { kind: "tool" }>,
) {
	if (item.status !== "completed" || !("outputJson" in item)) {
		throw new Error("Invalid durable tool result");
	}
	return item.outputJson;
}

function parsePersistedToolOutput(outputJson: string): unknown {
	try {
		return JSON.parse(outputJson);
	} catch {
		throw new Error("Invalid durable tool result");
	}
}

function parsePersistedId<TableName extends TableNames>(
	ctx: MutationCtx,
	tableName: TableName,
	outputJson: string,
): Id<TableName> {
	const output = parsePersistedToolOutput(outputJson);
	if (typeof output !== "string") {
		throw new Error("Invalid durable tool result");
	}
	const id = ctx.db.normalizeId(tableName, output);
	if (!id) throw new Error("Invalid durable tool result");
	return id;
}

export function requirePersistedCaseUpdate(
	ctx: MutationCtx,
	args: {
		outputJson: string;
		caseId: Id<"cases">;
	},
) {
	const caseId = parsePersistedId(ctx, "cases", args.outputJson);
	if (caseId !== args.caseId) {
		throw new Error("Invalid durable tool result");
	}
	return caseId;
}

export async function requirePersistedCreatedCase(
	ctx: MutationCtx,
	args: {
		outputJson: string;
		organizationId: Id<"organizations">;
		anchorCaseId: Id<"cases">;
	},
) {
	const caseId = parsePersistedId(ctx, "cases", args.outputJson);
	const createdCase = await ctx.db.get(caseId);
	if (
		!createdCase ||
		createdCase.organizationId !== args.organizationId ||
		createdCase._id === args.anchorCaseId
	) {
		throw new Error("Invalid durable create_case result");
	}
	const casePair = canonicalCasePair(args.anchorCaseId, createdCase._id);
	const relation = await ctx.db
		.query("caseCaseRelations")
		.withIndex("by_case_id_and_related_case_id_and_ended_at", (index) =>
			index
				.eq("caseId", casePair.caseId)
				.eq("relatedCaseId", casePair.relatedCaseId)
				.eq("endedAt", null),
		)
		.unique();
	if (!relation) throw new Error("Invalid durable create_case result");
	return createdCase._id;
}

export async function requirePersistedCaseRelation(
	ctx: MutationCtx,
	args: {
		outputJson: string;
		caseId: Id<"cases">;
		relation:
			| { kind: "contact"; contactId: Id<"contacts"> }
			| { kind: "entity"; entityId: Id<"entities"> }
			| { kind: "case"; relatedCaseId: Id<"cases"> }
			| { kind: "email_thread"; threadId: Id<"emailThreads"> };
	},
) {
	switch (args.relation.kind) {
		case "contact": {
			const relationId = parsePersistedId(
				ctx,
				"caseContactRelations",
				args.outputJson,
			);
			const relation = await ctx.db.get(relationId);
			if (
				!relation ||
				relation.caseId !== args.caseId ||
				relation.contactId !== args.relation.contactId ||
				relation.endedAt !== null
			) {
				throw new Error("Invalid durable add_case_relation result");
			}
			return relationId;
		}
		case "entity": {
			const relationId = parsePersistedId(
				ctx,
				"caseEntityRelations",
				args.outputJson,
			);
			const relation = await ctx.db.get(relationId);
			if (
				!relation ||
				relation.caseId !== args.caseId ||
				relation.entityId !== args.relation.entityId ||
				relation.endedAt !== null
			) {
				throw new Error("Invalid durable add_case_relation result");
			}
			return relationId;
		}
		case "case": {
			const relationId = parsePersistedId(
				ctx,
				"caseCaseRelations",
				args.outputJson,
			);
			const relation = await ctx.db.get(relationId);
			const pair = canonicalCasePair(args.caseId, args.relation.relatedCaseId);
			if (
				!relation ||
				relation.caseId !== pair.caseId ||
				relation.relatedCaseId !== pair.relatedCaseId ||
				relation.endedAt !== null
			) {
				throw new Error("Invalid durable add_case_relation result");
			}
			return relationId;
		}
		case "email_thread": {
			const relationId = parsePersistedId(
				ctx,
				"caseEmailThreadRelations",
				args.outputJson,
			);
			const relation = await ctx.db.get(relationId);
			if (
				!relation ||
				relation.caseId !== args.caseId ||
				relation.threadId !== args.relation.threadId ||
				relation.endedAt !== null
			) {
				throw new Error("Invalid durable add_case_relation result");
			}
			return relationId;
		}
	}
}
