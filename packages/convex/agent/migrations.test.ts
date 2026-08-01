import { describe, expect, it } from "vitest";
import { createTest } from "#/test.setup";
import { internal } from "../_generated/api";

async function createMigrationFixture(
	taskOrganization: "anchor" | "conflicting" = "anchor",
) {
	const test = createTest();
	const ids = await test.run(async (ctx) => {
		const organizationId = await ctx.db.insert("organizations", {
			name: "Anchor organization",
			workosOrganizationId: "org_anchor",
			active: true,
		});
		const conflictingOrganizationId = await ctx.db.insert("organizations", {
			name: "Conflicting task organization",
			workosOrganizationId: "org_conflicting",
			active: true,
		});
		const anchorCaseId = await ctx.db.insert("cases", {
			organizationId,
			reference: "CASE-MIGRATION",
			title: "Migration anchor",
			description: "",
			ownerMemberId: null,
			dueAt: null,
			status: "open",
			lastActivityAt: 100,
			createdAt: 100,
			updatedAt: 100,
		});
		const taskId = await ctx.db.insert("agentTasks", {
			organizationId:
				taskOrganization === "anchor"
					? organizationId
					: conflictingOrganizationId,
			anchorCaseId,
			agentKey: "agentV1",
			requestedAt: 100,
			requestedBy: "member",
			ownershipReleasedAt: 200,
			activeRunIds: [],
			activeApprovalIds: [],
			status: "failed",
			error: "Existing failure",
		});
		return { anchorCaseId, organizationId, taskId };
	});
	return { ids, test };
}

describe("agent task organization migration", () => {
	it("accepts tasks partitioned by their anchor case", async () => {
		const { ids, test } = await createMigrationFixture();

		await test.mutation(internal.migrations.backfillAgentTaskOrganizationIds, {
			oneBatchOnly: true,
			cursor: null,
			dryRun: false,
		});
		await test.mutation(internal.migrations.validateAgentTaskOrganizationIds, {
			oneBatchOnly: true,
			cursor: null,
			dryRun: false,
		});

		expect(await test.run(async (ctx) => ctx.db.get(ids.taskId))).toMatchObject(
			{
				organizationId: ids.organizationId,
				anchorCaseId: ids.anchorCaseId,
				status: "failed",
				error: "Existing failure",
			},
		);
	});

	it("rejects a task partition that conflicts with its anchor case", async () => {
		const { ids, test } = await createMigrationFixture("conflicting");

		await expect(
			test.mutation(internal.migrations.backfillAgentTaskOrganizationIds, {
				oneBatchOnly: true,
				cursor: null,
				dryRun: false,
			}),
		).rejects.toThrow(
			`has a different organization than case ${ids.anchorCaseId}`,
		);
	});

	it("stops when a task has lost its anchor case", async () => {
		const { ids, test } = await createMigrationFixture();
		await test.run(async (ctx) => ctx.db.delete("cases", ids.anchorCaseId));

		await expect(
			test.mutation(internal.migrations.backfillAgentTaskOrganizationIds, {
				oneBatchOnly: true,
				cursor: null,
				dryRun: false,
			}),
		).rejects.toThrow(`references missing case ${ids.anchorCaseId}`);
	});
});
