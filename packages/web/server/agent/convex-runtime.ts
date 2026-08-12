import { createOpenAI } from "@ai-sdk/openai";
import {
	defaultAgentDefinition,
	invokeAgentRun,
	type BuiltInToolKey,
	type AgentRuntimeAdapter,
	type ClaimedRun,
	type CustomToolDefinition,
} from "@merimoar/agent";
import { api } from "@merimoar/convex/api";
import type { Id, TableNames } from "@merimoar/convex/data-model";
import type {
	FunctionArgs,
	FunctionReference,
	FunctionReturnType,
} from "convex/server";
import { invokeCustomToolRequest } from "../custom-tools/executor";

const RUN_LEASE_DURATION_MS = 60_000;
const TRANSCRIPT_PAGE_SIZE = 50;

type RuntimeTranscript = Awaited<
	ReturnType<AgentRuntimeAdapter["getTranscript"]>
>;
type RuntimeTranscriptTurn = RuntimeTranscript["turns"][number];
type RuntimeTranscriptItem = RuntimeTranscriptTurn["items"][number];
type TranscriptPaginationOptions = {
	numItems: number;
	cursor: string | null;
};
type TranscriptPage<T> = {
	page: T[];
	isDone: boolean;
	continueCursor: string;
};
type TranscriptPageLoaders = {
	loadTurns(
		paginationOpts: TranscriptPaginationOptions,
	): Promise<{
		taskId: string;
		selectedStatusItemId?: string;
		turns: TranscriptPage<Omit<RuntimeTranscriptTurn, "items">>;
	}>;
	loadItems(
		turnId: string,
		paginationOpts: TranscriptPaginationOptions,
	): Promise<TranscriptPage<RuntimeTranscriptItem>>;
};

export type AgentInvocationConfiguration = {
	runtimeSecret: string;
	openaiApiKey: string;
	executionTimeoutMs: number;
};

export type ConvexAgentRuntimeClient = {
	mutation<Mutation extends FunctionReference<"mutation">>(
		mutation: Mutation,
		args: FunctionArgs<Mutation>,
	): Promise<FunctionReturnType<Mutation>>;
};

type AgentCaseRelation = Parameters<
	AgentRuntimeAdapter["addCaseRelation"]
>[0]["relation"];

type ConvexCaseRelation =
	| { kind: "contact"; contactId: Id<"contacts"> }
	| { kind: "entity"; entityId: Id<"entities"> }
	| { kind: "case"; relatedCaseId: Id<"cases"> }
	| { kind: "email_thread"; threadId: Id<"emailThreads"> };

export async function loadCompleteTranscript(
	loaders: TranscriptPageLoaders,
): Promise<RuntimeTranscript> {
	let turnCursor: string | null = null;
	let taskId: string | undefined;
	let selectedStatusItemId: string | undefined;
	const turns: RuntimeTranscriptTurn[] = [];

	do {
		const turnPage = await loaders.loadTurns({
			numItems: TRANSCRIPT_PAGE_SIZE,
			cursor: turnCursor,
		});
		taskId ??= turnPage.taskId;
		selectedStatusItemId ??= turnPage.selectedStatusItemId;

		for (const turn of turnPage.turns.page) {
			let itemCursor: string | null = null;
			const items: RuntimeTranscriptItem[] = [];
			do {
				const itemPage = await loaders.loadItems(turn.turnId, {
					numItems: TRANSCRIPT_PAGE_SIZE,
					cursor: itemCursor,
				});
				items.push(...itemPage.page);
				itemCursor = itemPage.isDone ? null : itemPage.continueCursor;
			} while (itemCursor !== null);
			turns.push({ ...turn, items });
		}

		turnCursor = turnPage.turns.isDone
			? null
			: turnPage.turns.continueCursor;
	} while (turnCursor !== null);

	if (!taskId) {
		throw new Error("Transcript pagination returned no task identifier.");
	}
	return {
		taskId,
		...(selectedStatusItemId ? { selectedStatusItemId } : {}),
		turns,
	};
}

export function createConvexAgentRunInvoker(
	client: ConvexAgentRuntimeClient,
	configuration: AgentInvocationConfiguration,
) {
	const openai = createOpenAI({
		apiKey: configuration.openaiApiKey,
	});
	return (claim: ClaimedRun, abortSignal: AbortSignal) =>
		invokeAgentRun({
			claim,
			runtime: createConvexRuntimeAdapter(
				client,
				configuration.runtimeSecret,
				claim,
			),
			model: openai.responses(defaultAgentDefinition.defaultModel),
			executionTimeoutMs: configuration.executionTimeoutMs,
			abortSignal,
		});
}

export function createConvexRuntimeAdapter(
	client: ConvexAgentRuntimeClient,
	runtimeSecret: string,
	claim: ClaimedRun,
): AgentRuntimeAdapter {
	const runId = asConvexId<"agentRuns">(claim.runId);
	const base = {
		runtimeSecret,
		runId,
		claimToken: claim.claimToken,
	};
	let customToolSnapshot: ReadonlyMap<string, CustomToolDefinition> | null = null;

	return {
		async loadActiveBuiltInTools() {
			const keys = await client.mutation(
				api.agent.builtInTools.loadActiveForRun,
				base,
			);
			return keys as BuiltInToolKey[];
		},
		async loadCustomTools() {
			if (customToolSnapshot) return [...customToolSnapshot.values()];
			const definitions = await client.mutation(
				api.agent.customTools.loadRunnableToolsForRun,
				base,
			);
			customToolSnapshot = new Map(
				definitions.map((definition) => [definition.toolId, definition]),
			);
			return definitions;
		},
		async invokeCustomTool(toolId, input) {
			const definition = customToolSnapshot?.get(toolId);
			if (!definition) {
				throw new Error("Custom tool is not available for this agent run.");
			}
			const result = await invokeCustomToolRequest(definition, input);
			return result.value;
		},
		getTranscript() {
			return loadCompleteTranscript({
				loadTurns: (paginationOpts) =>
					client.mutation(api.agent.runtime.getTranscript, {
						...base,
						paginationOpts,
					}),
				loadItems: (turnId, paginationOpts) =>
					client.mutation(api.agent.runtime.getTranscriptItems, {
						...base,
						turnId: asConvexId<"agentTurns">(turnId),
						paginationOpts,
					}),
			});
		},
		getSteeringMessages(afterSequence) {
			return client.mutation(api.agent.runtime.getSteeringMessages, {
				...base,
				afterSequence,
			});
		},
		async renewLease() {
			await client.mutation(api.agent.runtime.renewRunLease, {
				...base,
				leaseDurationMs: RUN_LEASE_DURATION_MS,
			});
		},
		async updateActivity(activity) {
			await client.mutation(api.agent.runtime.updateActivity, {
				...base,
				...activity,
			});
		},
		updateTaskStatus(update, toolCallId) {
			return client.mutation(api.agent.runtime.stageTaskStatus, {
				...base,
				toolCallId,
				update,
			});
		},
		startAgentMessage(body) {
			return client.mutation(api.agent.runtime.startAgentMessage, {
				...base,
				body,
			});
		},
		async updateAgentMessage(itemId, body) {
			await client.mutation(api.agent.runtime.updateAgentMessage, {
				...base,
				itemId: asConvexId<"agentItems">(itemId),
				body,
			});
		},
		async recordToolStarted(input) {
			const { customToolId, ...tool } = input;
			await client.mutation(api.agent.runtime.recordToolStarted, {
				...base,
				...tool,
				...(customToolId
					? { customToolId: asConvexId<"agentCustomTools">(customToolId) }
					: {}),
			});
		},
		async recordToolFinished(input) {
			await client.mutation(api.agent.runtime.recordToolFinished, {
				...base,
				...input,
			});
		},
		async recordToolApprovalRequest(input) {
			await client.mutation(api.agent.runtime.recordToolApprovalRequest, {
				...base,
				...input,
			});
		},
		async finishRun(usage) {
			await client.mutation(api.agent.runtime.finishRun, {
				...base,
				...(usage ? { usage } : {}),
			});
		},
		failRun(message, debug) {
			return client.mutation(api.agent.runtime.failRun, {
				...base,
				message,
				...(debug ? { debug } : {}),
			});
		},
		search(input) {
			return client.mutation(api.agent.tools.search, {
				...base,
				...input,
			});
		},
		inspectEntity({ entityId }) {
			return client.mutation(api.agent.tools.inspectEntity, {
				...base,
				entityId: asConvexId<"entities">(entityId),
			});
		},
		inspectContact({ contactId }) {
			return client.mutation(api.agent.tools.inspectContact, {
				...base,
				contactId: asConvexId<"contacts">(contactId),
			});
		},
		readCase({ caseId }) {
			return client.mutation(api.agent.tools.readCase, {
				...base,
				caseId: asConvexId<"cases">(caseId),
			});
		},
		createCase(input, toolCallId) {
			return client.mutation(api.agent.tools.createCase, {
				...base,
				...input,
				toolCallId,
			});
		},
		updateCase(input, toolCallId) {
			return client.mutation(api.agent.tools.updateCase, {
				...base,
				...input,
				caseId: asConvexId<"cases">(input.caseId),
				toolCallId,
			});
		},
		addCaseRelation(input, toolCallId) {
			return client.mutation(api.agent.tools.addCaseRelation, {
				...base,
				caseId: asConvexId<"cases">(input.caseId),
				relation: toConvexCaseRelation(input.relation),
				toolCallId,
			});
		},
		searchEmails(input) {
			return client.mutation(api.agent.tools.searchEmails, {
				...base,
				...input,
			});
		},
		readEmailThread({ threadId }) {
			return client.mutation(api.agent.tools.readEmailThread, {
				...base,
				threadId: asConvexId<"emailThreads">(threadId),
			});
		},
		sendEmail(input, toolCallId) {
			return client.mutation(api.agent.tools.sendEmail, {
				...base,
				threadId: asConvexId<"emailThreads">(input.threadId),
				body: input.body,
				toolCallId,
			});
		},
	};
}

function toConvexCaseRelation(
	relation: AgentCaseRelation,
): ConvexCaseRelation {
	switch (relation.kind) {
		case "contact":
			return {
				kind: relation.kind,
				contactId: asConvexId<"contacts">(relation.contactId),
			};
		case "entity":
			return {
				kind: relation.kind,
				entityId: asConvexId<"entities">(relation.entityId),
			};
		case "case":
			return {
				kind: relation.kind,
				relatedCaseId: asConvexId<"cases">(relation.relatedCaseId),
			};
		case "email_thread":
			return {
				kind: relation.kind,
				threadId: asConvexId<"emailThreads">(relation.threadId),
			};
	}
}

function asConvexId<TableName extends TableNames>(value: string): Id<TableName> {
	return value as Id<TableName>;
}
