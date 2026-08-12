/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
	computeCustomToolConfigurationHash,
	computeLegacyCustomToolConfigurationHash,
} from "./customToolModel";
import {
	claimExactRun,
	createFixture,
	delegateAndClaim,
	RUNTIME_SECRET,
	startTool,
} from "./testSupport.test-helper";

const fields = {
	name: "Read Temperature Metrics",
	description: "Read temperature metrics from the selected sensor.",
	path: "metrics/temperature",
	parameters: [
		{
			name: "sensor_id",
			type: "string" as const,
			description: "Stable sensor identifier",
			required: true,
		},
	],
	requiresApproval: true,
};

async function configurationHash(
	toolFields = fields,
	baseUrl = "https://metrics.example/api",
) {
	return await computeCustomToolConfigurationHash({
		baseUrl,
		path: toolFields.path,
		parameters: toolFields.parameters,
	});
}

async function legacyConfigurationHash(
	toolFields = fields,
	baseUrl = "https://metrics.example/api",
) {
	return await computeLegacyCustomToolConfigurationHash({
		baseUrl,
		path: `/${toolFields.path}`,
		parameters: toolFields.parameters,
	});
}

type Fixture = Awaited<ReturnType<typeof createFixture>>;

function createIntegration(
	actor: Fixture["actor"],
	name = "Metrics",
	baseUrl = "https://metrics.example/api",
) {
	return actor.mutation(api.agent.customTools.createIntegration, {
		name,
		baseUrl,
	});
}

async function saveTool(
	actor: Fixture["actor"],
	integrationId: Id<"customIntegrations">,
	options: {
		toolId?: Id<"agentCustomTools">;
		fields?: typeof fields;
		builtInTools?: string[];
	} = {},
) {
	const toolFields = options.fields ?? fields;
	return await actor.mutation(api.agent.customTools.saveTestedTool, {
		runtimeSecret: RUNTIME_SECRET,
		...(options.toolId ? { toolId: options.toolId } : {}),
		agentKey: "agent-v1",
		integration: { kind: "existing", integrationId },
		fields: toolFields,
		testedConfigurationHash: await configurationHash(toolFields),
		builtInTools: options.builtInTools ?? [],
	});
}

function loadTools(
	fixture: Fixture,
	claim: { runId: Id<"agentRuns">; claimToken: string },
) {
	return fixture.base.mutation(api.agent.customTools.loadRunnableToolsForRun, {
		runtimeSecret: RUNTIME_SECRET,
		runId: claim.runId,
		claimToken: claim.claimToken,
	});
}

describe("custom tool configuration", () => {
	it("creates an inline integration and tested tool atomically", async () => {
		const fixture = await createFixture();
		const saved = await fixture.actor.mutation(
			api.agent.customTools.saveTestedTool,
			{
				runtimeSecret: RUNTIME_SECRET,
				agentKey: "agent-v1",
				integration: {
					kind: "inline",
					name: "Metrics",
					baseUrl: "https://metrics.example/api",
				},
				fields,
				testedConfigurationHash: await configurationHash(),
				builtInTools: ["read_case"],
			},
		);

		const state = await fixture.actor.query(
			api.agent.customTools.listWorkspaceConfiguration,
			{},
		);
		expect(state).toHaveLength(1);
		expect(state[0]).toMatchObject({
			_id: saved.integrationId,
			name: "Metrics",
			baseUrl: "https://metrics.example/api",
			tools: [
				{
					_id: saved.toolId,
					name: fields.name,
					normalizedName: "read_temperature_metrics",
					needsRetest: false,
					requiresApproval: true,
				},
			],
		});
	});

	it("does not leave an inline integration when proof hash validation fails", async () => {
		const fixture = await createFixture();
		await expect(
			fixture.actor.mutation(api.agent.customTools.saveTestedTool, {
				runtimeSecret: RUNTIME_SECRET,
				agentKey: "agent-v1",
				integration: {
					kind: "inline",
					name: "Should roll back",
					baseUrl: "https://metrics.example/api",
				},
				fields,
				testedConfigurationHash: "0".repeat(64),
				builtInTools: [],
			}),
		).rejects.toThrow("Test the current tool configuration");
		expect(
			await fixture.actor.query(
				api.agent.customTools.listWorkspaceConfiguration,
				{},
			),
		).toEqual([]);
	});

	it("migrates legacy slash paths without requiring another test", async () => {
		const fixture = await createFixture();
		const integrationId = await createIntegration(fixture.actor);
		const saved = await saveTool(fixture.actor, integrationId);
		await fixture.base.run(async (ctx) => {
			await ctx.db.patch(saved.toolId, {
				path: "/metrics/temperature",
				testedConfigurationHash: await legacyConfigurationHash(),
			});
		});
		expect(
			(
				await fixture.actor.query(
					api.agent.customTools.listWorkspaceConfiguration,
					{},
				)
			)[0]?.tools[0],
		).toMatchObject({
			path: "metrics/temperature",
			needsRetest: false,
		});
		await fixture.base.mutation(internal.migrations.normalizeCustomToolPaths, {
			oneBatchOnly: true,
			cursor: null,
			dryRun: false,
		});

		const configuration = await fixture.actor.query(
			api.agent.customTools.listWorkspaceConfiguration,
			{},
		);
		expect(configuration[0]?.tools[0]).toMatchObject({
			path: "metrics/temperature",
			needsRetest: false,
		});

		const claim = await delegateAndClaim(fixture);
		expect(await loadTools(fixture, claim)).toHaveLength(1);
	});

	it("does not bless an invalid legacy test hash during path migration", async () => {
		const fixture = await createFixture();
		const integrationId = await createIntegration(fixture.actor);
		const saved = await saveTool(fixture.actor, integrationId);
		await fixture.base.run(async (ctx) => {
			await ctx.db.patch(saved.toolId, {
				path: "/metrics/temperature",
				testedConfigurationHash: "invalid-legacy-hash",
			});
		});

		await expect(
			fixture.base.mutation(internal.migrations.normalizeCustomToolPaths, {
				oneBatchOnly: true,
				cursor: null,
				dryRun: false,
			}),
		).rejects.toThrow("has no valid test proof");
		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(saved.toolId)),
		).toMatchObject({
			path: "/metrics/temperature",
			testedConfigurationHash: "invalid-legacy-hash",
		});
	});

	it("camel cases Acme demo parameters without refreshing the test hash", async () => {
		const fixture = await createFixture();
		const staleHash = "stale-test-hash";
		const toolId = await fixture.base.run(async (ctx) => {
			const integrationId = await ctx.db.insert("customIntegrations", {
				organizationId: fixture.organizationId,
				name: "MockAPI",
				baseUrl: "http://localhost:8000/",
				updatedAt: 1,
			});
			return await ctx.db.insert("agentCustomTools", {
				agentKey: "agent-v1",
				integrationId,
				name: "Request quote",
				normalizedName: "request_quote",
				description: "Request a quote.",
				path: "quote-requests",
				parameters: [
					{
						name: "property_identifier",
						type: "string",
						description: "Property identifier",
						required: true,
					},
					{
						name: "scope",
						type: "string",
						description: "Scope",
						required: true,
					},
				],
				requiresApproval: true,
				testedConfigurationHash: staleHash,
				updatedAt: 1,
			});
		});

		await fixture.base.mutation(
			internal.migrations.camelCaseAcmeDemoToolParameters,
			{ oneBatchOnly: true, cursor: null, dryRun: false },
		);

		expect(
			await fixture.base.run(async (ctx) => ctx.db.get(toolId)),
		).toMatchObject({
			parameters: [{ name: "propertyIdentifier" }, { name: "scope" }],
			testedConfigurationHash: staleHash,
			updatedAt: 1,
		});
	});

	it("rejects save bypasses, built-in collisions, and normalized collisions", async () => {
		const fixture = await createFixture();
		const integrationId = await createIntegration(fixture.actor);
		const args = {
			runtimeSecret: RUNTIME_SECRET,
			agentKey: "agent-v1",
			integration: { kind: "existing" as const, integrationId },
			fields,
			testedConfigurationHash: await configurationHash(),
			builtInTools: ["read_case"],
		};
		await expect(
			fixture.actor.mutation(api.agent.customTools.saveTestedTool, {
				...args,
				runtimeSecret: "wrong-secret-that-is-long-enough-for-an-attempt",
			}),
		).rejects.toThrow("runtime access denied");
		await expect(
			fixture.actor.mutation(api.agent.customTools.saveTestedTool, {
				...args,
				fields: { ...fields, name: "Read Case" },
				builtInTools: ["read_case"],
			}),
		).rejects.toThrow("built-in tool");

		await fixture.actor.mutation(api.agent.customTools.saveTestedTool, args);
		await expect(
			fixture.actor.mutation(api.agent.customTools.saveTestedTool, {
				...args,
				fields: { ...fields, name: "read-temperature metrics" },
			}),
		).rejects.toThrow("machine name already exists");
	});

	it("isolates integrations and tools by organization through the join", async () => {
		const fixture = await createFixture();
		const integrationId = await createIntegration(fixture.actor);
		await expect(
			fixture.otherActor.query(api.agent.customTools.getIntegrationForTest, {
				integrationId,
			}),
		).rejects.toThrow("could not be found");
		await expect(saveTool(fixture.otherActor, integrationId)).rejects.toThrow(
			"could not be found",
		);
		const otherIntegrationId = await createIntegration(
			fixture.otherActor,
			"Other metrics",
		);
		const otherSaved = await saveTool(fixture.otherActor, otherIntegrationId);
		const saved = await saveTool(fixture.actor, integrationId);
		const claim = await delegateAndClaim(fixture);
		expect(await loadTools(fixture, claim)).toMatchObject([
			{ toolId: saved.toolId },
		]);
		expect(saved.toolId).not.toBe(otherSaved.toolId);
	});

	it("invalidates future runs while preserving the claimed run snapshot", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		const integrationId = await createIntegration(fixture.actor);
		await saveTool(fixture.actor, integrationId);

		expect(await loadTools(fixture, claim)).toHaveLength(1);
		await fixture.actor.mutation(api.agent.customTools.updateIntegration, {
			integrationId,
			name: "Metrics",
			baseUrl: "https://metrics.example/v2",
		});
		expect(await loadTools(fixture, claim)).toMatchObject([
			{
				baseUrl: "https://metrics.example/api",
				normalizedName: "read_temperature_metrics",
			},
		]);
		const state = await fixture.actor.query(
			api.agent.customTools.listWorkspaceConfiguration,
			{},
		);
		expect(state[0]?.tools[0]?.needsRetest).toBe(true);

		const secondDelegation = await fixture.actor.mutation(
			api.agent.tasks.delegateCase,
			{
				caseId: fixture.secondCaseId,
				input: "Check that stale custom tools are unavailable.",
			},
		);
		const nextClaim = await claimExactRun(fixture, secondDelegation.runId, 0);
		if (!nextClaim) throw new Error("Expected a second claimed run");
		expect(
			await loadTools(fixture, {
				runId: nextClaim.runId,
				claimToken: nextClaim.claimToken,
			}),
		).toEqual([]);
	});

	it("reuses the persisted snapshot after a worker lease is retried", async () => {
		const fixture = await createFixture();
		const integrationId = await createIntegration(fixture.actor);
		await saveTool(fixture.actor, integrationId);
		const firstClaim = await delegateAndClaim(fixture);
		await loadTools(fixture, firstClaim);
		await fixture.actor.mutation(api.agent.customTools.updateIntegration, {
			integrationId,
			name: "Metrics",
			baseUrl: "https://metrics.example/v2",
		});
		await fixture.base.run(async (ctx) => {
			await ctx.db.patch(firstClaim.runId, { leaseExpiresAt: 0 });
		});
		await fixture.base.mutation(internal.agent.leases.requeueExpiredRun, {
			runId: firstClaim.runId,
			leaseGeneration: 1,
		});
		const reclaimed = await claimExactRun(fixture, firstClaim.runId, 1);
		expect(reclaimed?.runId).toBe(firstClaim.runId);
		if (!reclaimed) throw new Error("Expected the run to be reclaimed");
		expect(
			await loadTools(fixture, {
				runId: reclaimed.runId,
				claimToken: reclaimed.claimToken,
			}),
		).toMatchObject([{ baseUrl: "https://metrics.example/api" }]);
	});

	it("replays approvals with the exact source-run custom tool definition", async () => {
		const fixture = await createFixture();
		const integrationId = await createIntegration(fixture.actor);
		const saved = await saveTool(fixture.actor, integrationId);
		const sourceClaim = await delegateAndClaim(fixture);
		await loadTools(fixture, sourceClaim);
		await startTool(
			fixture,
			sourceClaim,
			"custom-tool-call",
			"read_temperature_metrics",
			{ customToolId: saved.toolId },
		);
		await fixture.base.mutation(api.agent.runtime.recordToolApprovalRequest, {
			runtimeSecret: RUNTIME_SECRET,
			runId: sourceClaim.runId,
			claimToken: sourceClaim.claimToken,
			toolCallId: "custom-tool-call",
			approvalId: "custom-tool-approval",
			request: "Approve the custom metrics request?",
		});
		await fixture.base.mutation(api.agent.runtime.finishRun, {
			runtimeSecret: RUNTIME_SECRET,
			runId: sourceClaim.runId,
			claimToken: sourceClaim.claimToken,
		});

		await saveTool(fixture.actor, integrationId, {
			toolId: saved.toolId,
			fields: {
				...fields,
				name: "Changed Temperature Reader",
				description: "Changed after the approval request.",
				requiresApproval: false,
			},
		});
		await fixture.actor.mutation(api.agent.customTools.updateIntegration, {
			integrationId,
			name: "Metrics",
			baseUrl: "https://metrics.example/v2",
		});
		const resumed = await fixture.actor.mutation(
			api.agent.tasks.answerApprovals,
			{
				taskId: sourceClaim.taskId,
				answers: [{ approvalId: "custom-tool-approval", approved: true }],
			},
		);
		if (!resumed.resumed) throw new Error("Expected approval continuation");
		const continuation = await claimExactRun(fixture, resumed.runId, 0);
		expect(continuation?.runId).toBe(resumed.runId);
		if (!continuation) throw new Error("Expected claimed continuation");
		expect(
			await loadTools(fixture, {
				runId: continuation.runId,
				claimToken: continuation.claimToken,
			}),
		).toMatchObject([
			{
				toolId: saved.toolId,
				name: "Changed Temperature Reader",
				baseUrl: "https://metrics.example/api",
				normalizedName: "read_temperature_metrics",
				description: fields.description,
				requiresApproval: true,
			},
		]);
		const sourceToolItem = await fixture.base.run(async (ctx) =>
			ctx.db
				.query("agentItems")
				.withIndex("by_run_id_and_tool_call_id", (index) =>
					index
						.eq("runId", sourceClaim.runId)
						.eq("toolCallId", "custom-tool-call"),
				)
				.unique(),
		);
		expect(sourceToolItem).toMatchObject({ customToolId: saved.toolId });
	});

	it("enforces the bounded integration scope instead of hiding later rows", async () => {
		const fixture = await createFixture();
		await fixture.base.run(async (ctx) => {
			for (let index = 0; index < 100; index += 1) {
				await ctx.db.insert("customIntegrations", {
					organizationId: fixture.organizationId,
					name: `Integration ${index}`,
					baseUrl: `https://service-${index}.example.com/`,
					updatedAt: index,
				});
			}
		});
		await expect(
			fixture.actor.mutation(api.agent.customTools.createIntegration, {
				name: "Invisible integration",
				baseUrl: "https://invisible.example.com/",
			}),
		).rejects.toThrow("at most 100 custom integrations");
	});

	it("enforces the bounded tool scope instead of truncating collision checks", async () => {
		const fixture = await createFixture();
		const integrationId = await createIntegration(fixture.actor);
		const testedConfigurationHash = await configurationHash();
		await fixture.base.run(async (ctx) => {
			for (let index = 0; index < 100; index += 1) {
				await ctx.db.insert("agentCustomTools", {
					agentKey: "agent-v1",
					integrationId,
					...fields,
					name: `Tool ${index}`,
					normalizedName: `tool_${index}`,
					testedConfigurationHash,
					updatedAt: index,
				});
			}
		});
		await expect(
			saveTool(fixture.actor, integrationId, {
				fields: { ...fields, name: "Tool 100" },
			}),
		).rejects.toThrow("at most 100 custom tools");
	});

	it("fails closed for a historically non-canonical tool row", async () => {
		const fixture = await createFixture();
		const integrationId = await createIntegration(fixture.actor);
		await fixture.base.run(async (ctx) => {
			await ctx.db.insert("agentCustomTools", {
				agentKey: "agent-v1",
				integrationId,
				...fields,
				normalizedName: "historically_wrong_name",
				testedConfigurationHash: await configurationHash(),
				updatedAt: 1,
			});
		});
		await expect(
			loadTools(fixture, await delegateAndClaim(fixture)),
		).rejects.toThrow("non-canonical stored fields");
	});

	it("allows non-request fields to change without another test", async () => {
		const fixture = await createFixture();
		const integrationId = await createIntegration(fixture.actor);
		const saved = await saveTool(fixture.actor, integrationId);
		await saveTool(fixture.actor, integrationId, {
			toolId: saved.toolId,
			fields: {
				...fields,
				name: "Temperature Reader",
				description: "A clearer model-facing description.",
				requiresApproval: false,
			},
		});
		const state = await fixture.actor.query(
			api.agent.customTools.listWorkspaceConfiguration,
			{},
		);
		expect(state[0]?.tools[0]).toMatchObject({
			name: "Temperature Reader",
			description: "A clearer model-facing description.",
			requiresApproval: false,
			needsRetest: false,
		});
	});
});
