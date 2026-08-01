import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import {
	createFixture,
	delegateAndClaim,
	finishWithTaskStatus,
} from "./testSupport.test-helper";

describe("agent workspace readers", () => {
	it("returns no detail for malformed or foreign task IDs", async () => {
		const fixture = await createFixture();
		const foreignTask = await fixture.otherActor.mutation(
			api.agent.tasks.delegateCase,
			{
				caseId: fixture.otherCaseId,
				input: "Resolve the foreign case.",
			},
		);

		const [malformed, foreign] = await Promise.all([
			fixture.actor.query(api.agent.reader.get, {
				taskId: "not-an-agent-task-id",
			}),
			fixture.actor.query(api.agent.reader.get, {
				taskId: foreignTask.taskId,
			}),
		]);

		expect(malformed).toBeNull();
		expect(foreign).toBeNull();
	});

	it("lists only tasks anchored in the member organization", async () => {
		const fixture = await createFixture();
		const localTask = await fixture.actor.mutation(
			api.agent.tasks.delegateCase,
			{
				caseId: fixture.caseId,
				input: "Resolve the local case.",
			},
		);
		await fixture.otherActor.mutation(api.agent.tasks.delegateCase, {
			caseId: fixture.otherCaseId,
			input: "Resolve the other case.",
		});
		await fixture.base.run(async (ctx) => {
			await ctx.db.insert("agentTasks", {
				organizationId: fixture.organizationId,
				anchorCaseId: fixture.otherCaseId,
				agentKey: "agentV1",
				status: "completed",
				requestedAt: 300,
				requestedBy: "member",
				requestedByMemberId: fixture.memberId,
				result: "Corrupt cross-organization anchor.",
				ownershipReleasedAt: 301,
				activeRunIds: [],
				activeApprovalIds: [],
			});
		});

		const localTasks = await fixture.actor.query(
			api.agent.reader.listWorkspaceTasks,
			{},
		);
		expect(localTasks).toHaveLength(1);
		expect(localTasks[0]).toMatchObject({
			taskId: localTask.taskId,
			anchorCase: {
				id: fixture.caseId,
				reference: "CASE-AGENT",
				title: "Agent case",
			},
			task: {
				status: "active",
				requestedBy: "member",
			},
			latestItem: {
				item: {
					kind: "member_message",
					body: "Resolve the local case.",
				},
			},
			pendingApprovalCount: 0,
		});

		const otherTasks = await fixture.otherActor.query(
			api.agent.reader.listWorkspaceTasks,
			{},
		);
		expect(otherTasks).toHaveLength(1);
		expect(otherTasks[0]?.anchorCase.id).toBe(fixture.otherCaseId);
	});

	it("lists the member's recent delegations newest first", async () => {
		const fixture = await createFixture();
		const { newerTaskId, olderTaskId } = await fixture.base.run(async (ctx) => {
			const otherMemberId = await ctx.db.insert("organizationMembers", {
				organizationId: fixture.organizationId,
				workosUserId: "another_member",
				active: true,
			});
			const createTask = async ({
				anchorCaseId,
				organizationId,
				requestedAt,
				requestedByMemberId,
			}: {
				anchorCaseId: typeof fixture.caseId;
				organizationId: typeof fixture.organizationId;
				requestedAt: number;
				requestedByMemberId: typeof fixture.memberId;
			}) =>
				await ctx.db.insert("agentTasks", {
					organizationId,
					anchorCaseId,
					agentKey: "agentV1",
					status: "active",
					requestedAt,
					requestedBy: "member",
					requestedByMemberId,
					ownershipReleasedAt: null,
					activeRunIds: [],
					activeApprovalIds: [],
				});

			const olderTaskId = await createTask({
				anchorCaseId: fixture.caseId,
				organizationId: fixture.organizationId,
				requestedAt: 100,
				requestedByMemberId: fixture.memberId,
			});
			const newerTaskId = await createTask({
				anchorCaseId: fixture.secondCaseId,
				organizationId: fixture.organizationId,
				requestedAt: 200,
				requestedByMemberId: fixture.memberId,
			});
			await createTask({
				anchorCaseId: fixture.caseId,
				organizationId: fixture.organizationId,
				requestedAt: 300,
				requestedByMemberId: otherMemberId,
			});
			await createTask({
				anchorCaseId: fixture.otherCaseId,
				organizationId: fixture.otherOrganizationId,
				requestedAt: 400,
				requestedByMemberId: fixture.memberId,
			});
			return { newerTaskId, olderTaskId };
		});

		const delegations = await fixture.actor.query(
			api.agent.reader.listRecentDelegations,
			{},
		);

		expect(delegations.map(({ taskId }) => taskId)).toEqual([
			newerTaskId,
			olderTaskId,
		]);
		expect(delegations).toMatchObject([
			{
				anchorCase: {
					id: fixture.secondCaseId,
					reference: "CASE-SECOND-AGENT",
				},
				task: { requestedAt: 200, requestedByMemberId: fixture.memberId },
			},
			{
				anchorCase: {
					id: fixture.caseId,
					reference: "CASE-AGENT",
				},
				task: { requestedAt: 100, requestedByMemberId: fixture.memberId },
			},
		]);
	});

	it("resolves the member who requested each task and turn", async () => {
		const fixture = await createFixture();
		const delegated = await fixture.actor.mutation(
			api.agent.tasks.delegateCase,
			{
				caseId: fixture.caseId,
				input: "Resolve this for another member.",
			},
		);
		const otherMemberId = await fixture.base.run(async (ctx) => {
			const memberId = await ctx.db.insert("organizationMembers", {
				organizationId: fixture.organizationId,
				workosUserId: "user_other_agent_test",
				active: true,
			});
			const turn = await ctx.db
				.query("agentTurns")
				.withIndex("by_task_id_and_sequence", (index) =>
					index.eq("taskId", delegated.taskId),
				)
				.unique();
			if (!turn) throw new Error("Expected delegated task to have a turn");
			await Promise.all([
				ctx.db.patch(delegated.taskId, { requestedByMemberId: memberId }),
				ctx.db.patch(turn._id, { requestedByMemberId: memberId }),
			]);
			return memberId;
		});

		const [detail, turns] = await Promise.all([
			fixture.actor.query(api.agent.reader.get, {
				taskId: delegated.taskId,
			}),
			fixture.actor.query(api.agent.reader.listTurns, {
				taskId: delegated.taskId,
				paginationOpts: { cursor: null, numItems: 20 },
			}),
		]);

		expect(detail?.requestedByMember).toEqual({
			id: otherMemberId,
			name: "Other Requester",
		});
		expect(turns.page[0]?.requestedByMember).toEqual({
			id: otherMemberId,
			name: "Other Requester",
		});
	});

	it("returns real pending approvals and recent transcript items", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		await finishWithTaskStatus(fixture, claim, {
			status: "waiting_for_approval",
			approvalId: "workspace-approval",
			approvalRequest: "Approve the next step.",
		});

		const [approvals, recentItems, tasks] = await Promise.all([
			fixture.actor.query(api.agent.reader.listPendingApprovals, {}),
			fixture.actor.query(api.agent.reader.listRecentItems, {
				taskId: claim.taskId,
			}),
			fixture.actor.query(api.agent.reader.listWorkspaceTasks, {}),
		]);

		expect(approvals).toMatchObject([
			{
				taskId: claim.taskId,
				anchorCase: { id: fixture.caseId },
				approvals: [
					{
						item: {
							kind: "approval",
							status: "pending",
							approvalId: "workspace-approval",
							request: "Approve the next step.",
						},
					},
				],
			},
		]);
		expect(recentItems.some(({ item }) => item.kind === "approval")).toBe(true);
		expect(tasks[0]).toMatchObject({
			taskId: claim.taskId,
			task: { status: "waiting_for_approval" },
			pendingApprovalCount: 1,
		});
	});

	it("keeps an older case's task and approval in organization-scoped reads", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		await finishWithTaskStatus(fixture, claim, {
			status: "waiting_for_approval",
			approvalId: "older-case-approval",
			approvalRequest: "Approve work on the older case.",
		});
		await fixture.base.run(async (ctx) => {
			await ctx.db.patch(fixture.caseId, { lastActivityAt: 1 });
			for (let index = 0; index < 101; index += 1) {
				await ctx.db.insert("cases", {
					organizationId: fixture.organizationId,
					reference: `CASE-NEWER-${index}`,
					title: `Newer case ${index}`,
					description: "",
					ownerMemberId: null,
					dueAt: null,
					status: "open",
					lastActivityAt: 1_000 + index,
					createdAt: 1_000 + index,
					updatedAt: 1_000 + index,
				});
			}
		});

		const [tasks, approvals] = await Promise.all([
			fixture.actor.query(api.agent.reader.listWorkspaceTasks, {}),
			fixture.actor.query(api.agent.reader.listPendingApprovals, {}),
		]);

		expect(tasks.map(({ taskId }) => taskId)).toContain(claim.taskId);
		expect(approvals.map(({ taskId }) => taskId)).toContain(claim.taskId);
	});
});
