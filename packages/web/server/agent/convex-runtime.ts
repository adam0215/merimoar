import { createOpenAI } from "@ai-sdk/openai";
import {
	defaultAgentDefinition,
	invokeAgentRun,
	type AgentRunSubscriberHost,
	type AgentRuntimeAdapter,
	type ClaimedRun,
} from "@merimoar/agent";
import { api } from "@merimoar/convex/api";
import type { Id, TableNames } from "@merimoar/convex/data-model";
import { ConvexClient } from "convex/browser";

const RUN_LEASE_DURATION_MS = 60_000;

type RuntimeConfiguration = {
	convexUrl: string;
	runtimeSecret: string;
	openaiApiKey: string;
	executionTimeoutMs: number;
};

type AgentCaseRelation = Parameters<
	AgentRuntimeAdapter["addCaseRelation"]
>[0]["relation"];

type ConvexCaseRelation =
	| { kind: "contact"; contactId: Id<"contacts"> }
	| { kind: "entity"; entityId: Id<"entities"> }
	| { kind: "case"; relatedCaseId: Id<"cases"> }
	| { kind: "email_thread"; threadId: Id<"emailThreads"> };

export function createConvexAgentSubscriberHost(
	configuration: RuntimeConfiguration,
	onError: (error: unknown) => void,
): AgentRunSubscriberHost {
	const client = new ConvexClient(configuration.convexUrl, {
		logger: false,
	});
	const openai = createOpenAI({
		apiKey: configuration.openaiApiKey,
	});

	return {
		subscribeToRunnableRuns(onSnapshot, onSubscriptionError) {
			return client.onUpdate(
				api.agent.runtime.observeNextQueuedRun,
				{ runtimeSecret: configuration.runtimeSecret },
				onSnapshot,
				onSubscriptionError,
			);
		},
		async claimNextRun(claimToken) {
			const claim = await client.mutation(api.agent.runtime.claimNextRun, {
				runtimeSecret: configuration.runtimeSecret,
				claimToken,
				leaseDurationMs: RUN_LEASE_DURATION_MS,
			});
			return claim ? { ...claim, claimToken } : null;
		},
		invokeRun(claim, abortSignal) {
			return invokeAgentRun({
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
		},
		async relinquishRun(claim) {
			await client.mutation(api.agent.runtime.relinquishRun, {
				runtimeSecret: configuration.runtimeSecret,
				runId: asConvexId<"agentRuns">(claim.runId),
				claimToken: claim.claimToken,
			});
		},
		close() {
			return client.close();
		},
		onError,
	};
}

function createConvexRuntimeAdapter(
	client: ConvexClient,
	runtimeSecret: string,
	claim: ClaimedRun,
): AgentRuntimeAdapter {
	const runId = asConvexId<"agentRuns">(claim.runId);
	const base = {
		runtimeSecret,
		runId,
		claimToken: claim.claimToken,
	};

	return {
		getTranscript() {
			return client.mutation(api.agent.runtime.getTranscript, {
				...base,
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
			await client.mutation(api.agent.runtime.recordToolStarted, {
				...base,
				...input,
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
