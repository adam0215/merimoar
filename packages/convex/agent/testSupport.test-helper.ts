/// <reference types="vite/client" />

import type { FunctionReturnType } from "convex/server";
import { vi } from "vitest";
import { createTest, syncWorkosUser } from "#/test.setup";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { AgentTaskStatusUpdate } from "./model";

const ISSUER = "https://api.workos.com/";
export const RUNTIME_SECRET =
	"test_agent_runtime_secret_at_least_32_characters";

vi.mock("@google/genai", () => ({
	GoogleGenAI: class {
		models = {
			embedContent: async () => ({
				embeddings: [
					{
						values: Array.from({ length: 768 }, (_, index) =>
							index === 0 ? 1 : 0,
						),
					},
				],
			}),
		};
	},
}));

export async function createFixture() {
	const base = createTest();
	await Promise.all([
		syncWorkosUser(base, {
			id: "user_agent_test",
			name: "Agent Requester",
			email: "requester@example.com",
		}),
		syncWorkosUser(base, {
			id: "user_other_agent_test",
			name: "Other Requester",
			email: "other@example.com",
		}),
	]);
	const ids = await base.run(async (ctx) => {
		const organizationId = await ctx.db.insert("organizations", {
			name: "Agent organization",
			workosOrganizationId: "org_agent_test",
			referenceSlug: "AGNT",
			active: true,
		});
		const otherOrganizationId = await ctx.db.insert("organizations", {
			name: "Other organization",
			workosOrganizationId: "org_other_agent_test",
			referenceSlug: "OTHR",
			active: true,
		});
		const memberId = await ctx.db.insert("organizationMembers", {
			organizationId,
			workosUserId: "user_agent_test",
			active: true,
		});
		await ctx.db.insert("organizationMembers", {
			organizationId: otherOrganizationId,
			workosUserId: "user_other_agent_test",
			active: true,
		});
		const caseId = await insertCase(
			ctx,
			organizationId,
			"CASE-AGENT",
			"Agent case",
		);
		const secondCaseId = await insertCase(
			ctx,
			organizationId,
			"CASE-SECOND-AGENT",
			"Second agent case",
		);
		const contactId = await ctx.db.insert("contacts", {
			organizationId,
			address: "agent-contact@example.com",
			name: "Agent Contact",
			firstSeenAt: 100,
			lastSeenAt: 100,
		});
		const entityTypeId = await ctx.db.insert("entityTypes", {
			organizationId,
			key: "agent-test-entity",
			name: "Agent test entity",
			pluralName: "Agent test entities",
			identifierLabel: "ID",
			description: "",
			icon: "home",
			archivedAt: null,
		});
		const entityId = await ctx.db.insert("entities", {
			entityTypeId,
			identifier: "AGENT-ENTITY",
			normalizedIdentifier: "agent-entity",
			displayName: "Agent Entity",
			createdAt: 100,
			updatedAt: 100,
			archivedAt: null,
		});
		const inboxId = await ctx.db.insert("emailInboxes", {
			organizationId,
			displayName: "Agent test inbox",
			address: "agent-inbox@example.com",
			status: "active",
			unreadThreadCount: 0,
		});
		const linkedThreadId = await ctx.db.insert("emailThreads", {
			organizationId,
			inboxId,
			lastActivityAt: 100,
		});
		const unlinkedThreadId = await ctx.db.insert("emailThreads", {
			organizationId,
			inboxId,
			lastActivityAt: 100,
		});
		const emailRelationId = await ctx.db.insert("caseEmailThreadRelations", {
			caseId,
			threadId: linkedThreadId,
			startedAt: 100,
			endedAt: null,
			linkedByMemberId: memberId,
			unlinkedByMemberId: null,
		});
		const contactRelationId = await ctx.db.insert("caseContactRelations", {
			caseId,
			contactId,
			startedAt: 100,
			endedAt: null,
			addedByMemberId: memberId,
			removedByMemberId: null,
		});
		const entityRelationId = await ctx.db.insert("caseEntityRelations", {
			caseId,
			entityId,
			startedAt: 100,
			endedAt: null,
			addedByMemberId: memberId,
			removedByMemberId: null,
		});
		const [relationCaseId, relatedCaseId] =
			caseId < secondCaseId ? [caseId, secondCaseId] : [secondCaseId, caseId];
		const caseRelationId = await ctx.db.insert("caseCaseRelations", {
			caseId: relationCaseId,
			relatedCaseId,
			startedAt: 100,
			endedAt: null,
			addedByMemberId: memberId,
			removedByMemberId: null,
		});
		const otherCaseId = await insertCase(
			ctx,
			otherOrganizationId,
			"CASE-OTHER-AGENT",
			"Other agent case",
		);
		return {
			caseId,
			caseRelationId,
			contactId,
			contactRelationId,
			emailRelationId,
			entityId,
			entityRelationId,
			linkedThreadId,
			memberId,
			organizationId,
			otherCaseId,
			otherOrganizationId,
			secondCaseId,
			unlinkedThreadId,
		};
	});
	return {
		base,
		actor: base.withIdentity({
			issuer: ISSUER,
			subject: "user_agent_test",
			org_id: "org_agent_test",
		}),
		otherActor: base.withIdentity({
			issuer: ISSUER,
			subject: "user_other_agent_test",
			org_id: "org_other_agent_test",
		}),
		...ids,
	};
}

export async function insertCase(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	reference: string,
	title: string,
) {
	return await ctx.db.insert("cases", {
		organizationId,
		reference,
		title,
		description: "",
		ownerMemberId: null,
		dueAt: null,
		status: "open",
		lastActivityAt: 100,
		createdAt: 100,
		updatedAt: 100,
	});
}

export async function delegateAndClaim(
	fixture: Awaited<ReturnType<typeof createFixture>>,
) {
	const delegation = await fixture.actor.mutation(
		api.agent.tasks.delegateCase,
		{
			caseId: fixture.caseId,
			input: "Resolve the case and document the outcome.",
		},
	);
	const claim = await claimExactRun(fixture, delegation.runId, 0);
	return { ...delegation, ...claim };
}

export async function claimExactRun(
	fixture: Awaited<ReturnType<typeof createFixture>>,
	runId: Id<"agentRuns">,
	leaseGeneration: number,
) {
	const claimToken = crypto.randomUUID();
	const claim = await fixture.base.mutation(api.agent.runtime.claimRun, {
		runtimeSecret: RUNTIME_SECRET,
		runId,
		leaseGeneration,
		claimToken,
		leaseDurationMs: 60_000,
	});
	if (!claim) throw new Error("Expected a claimed run");
	return { ...claim, claimToken };
}

type TranscriptTurnPage = FunctionReturnType<
	typeof api.agent.runtime.getTranscript
>;
type TranscriptItemPage = FunctionReturnType<
	typeof api.agent.runtime.getTranscriptItems
>;

export async function loadCompleteRuntimeTranscript(
	fixture: Awaited<ReturnType<typeof createFixture>>,
	claim: { runId: Id<"agentRuns">; claimToken: string },
	pageSize = 50,
) {
	let turnCursor: string | null = null;
	let taskId: Id<"agentTasks"> | undefined;
	let selectedStatusItemId: Id<"agentItems"> | undefined;
	const turns: Array<
		TranscriptTurnPage["turns"]["page"][number] & {
			items: TranscriptItemPage["page"];
		}
	> = [];

	do {
		const turnPage: TranscriptTurnPage = await fixture.base.mutation(
			api.agent.runtime.getTranscript,
			{
				runtimeSecret: RUNTIME_SECRET,
				runId: claim.runId,
				claimToken: claim.claimToken,
				paginationOpts: { numItems: pageSize, cursor: turnCursor },
			},
		);
		taskId ??= turnPage.taskId;
		selectedStatusItemId ??= turnPage.selectedStatusItemId;

		for (const turn of turnPage.turns.page) {
			let itemCursor: string | null = null;
			const items: TranscriptItemPage["page"] = [];
			do {
				const itemPage: TranscriptItemPage = await fixture.base.mutation(
					api.agent.runtime.getTranscriptItems,
					{
						runtimeSecret: RUNTIME_SECRET,
						runId: claim.runId,
						claimToken: claim.claimToken,
						turnId: turn.turnId,
						paginationOpts: { numItems: pageSize, cursor: itemCursor },
					},
				);
				items.push(...itemPage.page);
				itemCursor = itemPage.isDone ? null : itemPage.continueCursor;
			} while (itemCursor !== null);
			turns.push({ ...turn, items });
		}
		turnCursor = turnPage.turns.isDone ? null : turnPage.turns.continueCursor;
	} while (turnCursor !== null);

	if (!taskId) throw new Error("Expected transcript task metadata");
	return {
		taskId,
		...(selectedStatusItemId ? { selectedStatusItemId } : {}),
		turns,
	};
}

export async function startTool(
	fixture: Awaited<ReturnType<typeof createFixture>>,
	claim: { runId: Id<"agentRuns">; claimToken: string },
	toolCallId: string,
	toolName: string,
	options: { customToolId?: Id<"agentCustomTools"> } = {},
) {
	await fixture.base.mutation(api.agent.runtime.recordToolStarted, {
		runtimeSecret: RUNTIME_SECRET,
		runId: claim.runId,
		claimToken: claim.claimToken,
		toolCallId,
		toolName,
		...(options.customToolId ? { customToolId: options.customToolId } : {}),
		inputJson: "{}",
		summary: `Testing ${toolName}`,
	});
}

export async function finishWithTaskStatus(
	fixture: Awaited<ReturnType<typeof createFixture>>,
	claim: { runId: Id<"agentRuns">; claimToken: string },
	update: AgentTaskStatusUpdate,
) {
	const toolCallId = `status-${crypto.randomUUID()}`;
	await startTool(fixture, claim, toolCallId, "update_task_status");
	await fixture.base.mutation(api.agent.runtime.stageTaskStatus, {
		runtimeSecret: RUNTIME_SECRET,
		runId: claim.runId,
		claimToken: claim.claimToken,
		toolCallId,
		update,
	});
	await fixture.base.mutation(api.agent.runtime.finishRun, {
		runtimeSecret: RUNTIME_SECRET,
		runId: claim.runId,
		claimToken: claim.claimToken,
	});
}
