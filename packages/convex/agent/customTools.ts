import { ConvexError, type Infer, v } from "convex/values";
import {
	requireAgentRuntimeSecret,
	requireClaimedAgentRun,
} from "#/agent/access";
import {
	computeCustomToolConfigurationHash,
	computeLegacyCustomToolConfigurationHash,
	customToolFieldsValidator,
	customToolRunSnapshotValidator,
	customToolRuntimeDefinitionValidator,
	normalizeCustomIntegrationInput,
	normalizeCustomToolFields,
	normalizeCustomToolName,
} from "#/agent/customToolModel";
import { requireActor } from "#/auth/access";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";

const MAX_CUSTOM_INTEGRATIONS = 100;
const MAX_CUSTOM_TOOLS_PER_ORGANIZATION = 100;

const integrationSelectionValidator = v.union(
	v.object({
		kind: v.literal("existing"),
		integrationId: v.id("customIntegrations"),
	}),
	v.object({
		kind: v.literal("inline"),
		name: v.string(),
		baseUrl: v.string(),
	}),
);

type CustomToolRuntimeDefinition = Infer<
	typeof customToolRuntimeDefinitionValidator
>;
type CustomToolRunSnapshot = Infer<typeof customToolRunSnapshotValidator>;
type OrganizationTool = {
	integration: Doc<"customIntegrations">;
	tool: Doc<"agentCustomTools">;
};

function customToolConflict(message: string): never {
	throw new ConvexError({ code: "CUSTOM_TOOL_CONFLICT", message });
}

function customToolLimitExceeded(message: string): never {
	throw new ConvexError({ code: "CUSTOM_TOOL_LIMIT_EXCEEDED", message });
}

async function loadOrganizationIntegrations(
	ctx: QueryCtx | MutationCtx,
	organizationId: Id<"organizations">,
) {
	const integrations = await ctx.db
		.query("customIntegrations")
		.withIndex("by_organization_id", (index) =>
			index.eq("organizationId", organizationId),
		)
		.take(MAX_CUSTOM_INTEGRATIONS + 1);
	if (integrations.length > MAX_CUSTOM_INTEGRATIONS) {
		customToolLimitExceeded(
			`An organization can have at most ${MAX_CUSTOM_INTEGRATIONS} custom integrations.`,
		);
	}
	return integrations;
}

function assertStoredToolNameMatches(tool: Doc<"agentCustomTools">) {
	if (normalizeCustomToolName(tool.name) !== tool.normalizedName) {
		throw new Error("Custom tool has non-canonical stored fields.");
	}
}

async function loadOrganizationTools(
	ctx: QueryCtx | MutationCtx,
	integrations: Doc<"customIntegrations">[],
) {
	const organizationTools: OrganizationTool[] = [];
	for (const integration of integrations) {
		const remaining =
			MAX_CUSTOM_TOOLS_PER_ORGANIZATION - organizationTools.length;
		const tools = await ctx.db
			.query("agentCustomTools")
			.withIndex("by_integration_id", (index) =>
				index.eq("integrationId", integration._id),
			)
			.take(remaining + 1);
		if (tools.length > remaining) {
			customToolLimitExceeded(
				`An organization can have at most ${MAX_CUSTOM_TOOLS_PER_ORGANIZATION} custom tools.`,
			);
		}
		for (const tool of tools) assertStoredToolNameMatches(tool);
		organizationTools.push(...tools.map((tool) => ({ integration, tool })));
	}
	return organizationTools;
}

async function requireOwnedIntegration(
	ctx: QueryCtx | MutationCtx,
	integrationId: Id<"customIntegrations">,
	organizationId: Id<"organizations">,
) {
	const integration = await ctx.db.get(integrationId);
	if (!integration || integration.organizationId !== organizationId) {
		throw new ConvexError({
			code: "CUSTOM_INTEGRATION_NOT_FOUND",
			message: "Custom integration could not be found.",
		});
	}
	return integration;
}

async function requireOwnedTool(
	ctx: QueryCtx | MutationCtx,
	toolId: Id<"agentCustomTools">,
	organizationId: Id<"organizations">,
) {
	const tool = await ctx.db.get(toolId);
	if (!tool) customToolConflict("Custom tool could not be found.");
	const integration = await requireOwnedIntegration(
		ctx,
		tool.integrationId,
		organizationId,
	);
	return { integration, tool };
}

async function assertAvailableIntegrationName(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	name: string,
	exceptId?: Id<"customIntegrations">,
) {
	const matches = await ctx.db
		.query("customIntegrations")
		.withIndex("by_organization_id_and_name", (index) =>
			index.eq("organizationId", organizationId).eq("name", name),
		)
		.take(2);
	if (matches.some((integration) => integration._id !== exceptId)) {
		customToolConflict("An integration with this name already exists.");
	}
}

function assertAvailableToolName(
	organizationTools: OrganizationTool[],
	agentKey: string,
	normalizedName: string,
	builtInTools: string[],
	exceptId?: Id<"agentCustomTools">,
) {
	if (builtInTools.includes(normalizedName)) {
		customToolConflict("Tool name conflicts with a built-in tool.");
	}
	if (
		organizationTools.some(
			({ tool }) =>
				tool._id !== exceptId &&
				tool.agentKey === agentKey &&
				tool.normalizedName === normalizedName,
		)
	) {
		customToolConflict("An agent tool with this machine name already exists.");
	}
}

function toolPathForCurrentModel(path: string) {
	return path.startsWith("/") ? path.slice(1) : path;
}

async function verifiedToolConfiguration(
	integration: Doc<"customIntegrations">,
	tool: Doc<"agentCustomTools">,
) {
	const path = toolPathForCurrentModel(tool.path);
	const configurationHash = await computeCustomToolConfigurationHash({
		baseUrl: integration.baseUrl,
		path,
		parameters: tool.parameters,
	});
	if (configurationHash === tool.testedConfigurationHash) {
		return { configurationHash, path };
	}
	if (!tool.path.startsWith("/")) {
		return null;
	}
	const legacyHash = await computeLegacyCustomToolConfigurationHash({
		baseUrl: integration.baseUrl,
		path: tool.path,
		parameters: tool.parameters,
	});
	return legacyHash === tool.testedConfigurationHash
		? { configurationHash, path }
		: null;
}

export const listWorkspaceConfiguration = query({
	args: {},
	handler: async (ctx) => {
		const { organization } = await requireActor(ctx);
		const integrations = await loadOrganizationIntegrations(
			ctx,
			organization._id,
		);
		const organizationTools = await loadOrganizationTools(ctx, integrations);
		return await Promise.all(
			integrations.map(async (integration) => ({
				...integration,
				tools: await Promise.all(
					organizationTools
						.filter((item) => item.integration._id === integration._id)
						.map(async ({ tool }) => ({
							...tool,
							path: toolPathForCurrentModel(tool.path),
							needsRetest: !(await verifiedToolConfiguration(
								integration,
								tool,
							)),
						})),
				),
			})),
		);
	},
});

export const getIntegrationForTest = query({
	args: { integrationId: v.id("customIntegrations") },
	handler: async (ctx, args) => {
		const { organization } = await requireActor(ctx);
		return await requireOwnedIntegration(
			ctx,
			args.integrationId,
			organization._id,
		);
	},
});

export const getToolForSave = query({
	args: { toolId: v.id("agentCustomTools") },
	handler: async (ctx, args) => {
		const { organization } = await requireActor(ctx);
		return (await requireOwnedTool(ctx, args.toolId, organization._id)).tool;
	},
});

export const createIntegration = mutation({
	args: { name: v.string(), baseUrl: v.string() },
	returns: v.id("customIntegrations"),
	handler: async (ctx, args) => {
		const { organization } = await requireActor(ctx);
		const integrations = await loadOrganizationIntegrations(
			ctx,
			organization._id,
		);
		if (integrations.length >= MAX_CUSTOM_INTEGRATIONS) {
			customToolLimitExceeded(
				`An organization can have at most ${MAX_CUSTOM_INTEGRATIONS} custom integrations.`,
			);
		}
		const integration = normalizeCustomIntegrationInput(args);
		await assertAvailableIntegrationName(
			ctx,
			organization._id,
			integration.name,
		);
		return await ctx.db.insert("customIntegrations", {
			organizationId: organization._id,
			...integration,
			updatedAt: Date.now(),
		});
	},
});

export const updateIntegration = mutation({
	args: {
		integrationId: v.id("customIntegrations"),
		name: v.string(),
		baseUrl: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { organization } = await requireActor(ctx);
		await requireOwnedIntegration(ctx, args.integrationId, organization._id);
		const integration = normalizeCustomIntegrationInput(args);
		await assertAvailableIntegrationName(
			ctx,
			organization._id,
			integration.name,
			args.integrationId,
		);
		await ctx.db.patch(args.integrationId, {
			...integration,
			updatedAt: Date.now(),
		});
		return null;
	},
});

export const saveTestedTool = mutation({
	args: {
		runtimeSecret: v.string(),
		toolId: v.optional(v.id("agentCustomTools")),
		agentKey: v.string(),
		integration: integrationSelectionValidator,
		fields: customToolFieldsValidator,
		testedConfigurationHash: v.string(),
		builtInTools: v.array(v.string()),
	},
	returns: v.object({
		toolId: v.id("agentCustomTools"),
		integrationId: v.id("customIntegrations"),
	}),
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		const { organization } = await requireActor(ctx);
		const integrations = await loadOrganizationIntegrations(
			ctx,
			organization._id,
		);
		const organizationTools = await loadOrganizationTools(ctx, integrations);
		const fields = normalizeCustomToolFields(args.fields);
		const existing = args.toolId
			? await requireOwnedTool(ctx, args.toolId, organization._id)
			: null;
		if (
			!existing &&
			organizationTools.length >= MAX_CUSTOM_TOOLS_PER_ORGANIZATION
		) {
			customToolLimitExceeded(
				`An organization can have at most ${MAX_CUSTOM_TOOLS_PER_ORGANIZATION} custom tools.`,
			);
		}
		assertAvailableToolName(
			organizationTools,
			args.agentKey,
			fields.normalizedName,
			args.builtInTools,
			args.toolId,
		);

		const integrationSelection =
			args.integration.kind === "existing"
				? {
						kind: "existing" as const,
						value: await requireOwnedIntegration(
							ctx,
							args.integration.integrationId,
							organization._id,
						),
					}
				: {
						kind: "inline" as const,
						value: normalizeCustomIntegrationInput(args.integration),
					};
		if (args.integration.kind === "inline") {
			if (existing) {
				customToolConflict("Existing tools must use a saved integration.");
			}
			if (integrations.length >= MAX_CUSTOM_INTEGRATIONS) {
				customToolLimitExceeded(
					`An organization can have at most ${MAX_CUSTOM_INTEGRATIONS} custom integrations.`,
				);
			}
			await assertAvailableIntegrationName(
				ctx,
				organization._id,
				integrationSelection.value.name,
			);
		}
		const currentHash = await computeCustomToolConfigurationHash({
			baseUrl: integrationSelection.value.baseUrl,
			path: fields.path,
			parameters: fields.parameters,
		});
		if (currentHash !== args.testedConfigurationHash) {
			throw new ConvexError({
				code: "CUSTOM_TOOL_TEST_REQUIRED",
				message: "Test the current tool configuration before saving.",
			});
		}

		const now = Date.now();
		const integrationId =
			integrationSelection.kind === "existing"
				? integrationSelection.value._id
				: await ctx.db.insert("customIntegrations", {
						organizationId: organization._id,
						...integrationSelection.value,
						updatedAt: now,
					});
		const storedTool = {
			agentKey: args.agentKey,
			integrationId,
			...fields,
			testedConfigurationHash: currentHash,
			updatedAt: now,
		};
		if (existing) {
			await ctx.db.patch(existing.tool._id, storedTool);
			return { toolId: existing.tool._id, integrationId };
		}
		const toolId = await ctx.db.insert("agentCustomTools", storedTool);
		return { toolId, integrationId };
	},
});

function runtimeDefinitionFromSnapshot(snapshot: CustomToolRunSnapshot) {
	return {
		toolId: snapshot.toolId,
		normalizedName: snapshot.normalizedName,
		description: snapshot.description,
		parameters: snapshot.parameters,
		requiresApproval: snapshot.requiresApproval,
		baseUrl: snapshot.baseUrl,
		path: snapshot.path,
	};
}

async function runtimeDefinitionsWithCurrentNames(
	ctx: MutationCtx,
	snapshots: CustomToolRunSnapshot[],
): Promise<CustomToolRuntimeDefinition[]> {
	return await Promise.all(
		snapshots.map(async (snapshot) => ({
			...runtimeDefinitionFromSnapshot(snapshot),
			name:
				(await ctx.db.get("agentCustomTools", snapshot.toolId))?.name ??
				snapshot.normalizedName,
		})),
	);
}

async function createCurrentRunSnapshot(
	organizationTools: OrganizationTool[],
	agentKey: string,
) {
	const snapshots: CustomToolRunSnapshot[] = [];
	for (const { integration, tool } of organizationTools) {
		if (tool.agentKey !== agentKey) continue;
		const verifiedConfiguration = await verifiedToolConfiguration(
			integration,
			tool,
		);
		if (!verifiedConfiguration) continue;
		snapshots.push({
			toolId: tool._id,
			normalizedName: tool.normalizedName,
			description: tool.description,
			parameters: tool.parameters,
			requiresApproval: tool.requiresApproval,
			baseUrl: integration.baseUrl,
			path: verifiedConfiguration.path,
			configurationHash: verifiedConfiguration.configurationHash,
		});
	}
	return snapshots;
}

async function loadRunSnapshot(ctx: MutationCtx, runId: Id<"agentRuns">) {
	const rows = await ctx.db
		.query("agentRunCustomToolDefinitions")
		.withIndex("by_run_id", (index) => index.eq("runId", runId))
		.take(MAX_CUSTOM_TOOLS_PER_ORGANIZATION + 1);
	if (rows.length > MAX_CUSTOM_TOOLS_PER_ORGANIZATION) {
		throw new Error("Agent run custom tool snapshot exceeds its limit.");
	}
	return rows.map((row) => ({
		...runtimeDefinitionFromSnapshot(row),
		configurationHash: row.configurationHash,
	}));
}

async function loadApprovalContinuationSnapshot(
	ctx: MutationCtx,
	task: Doc<"agentTasks">,
	continuationRunId: Id<"agentRuns">,
) {
	const snapshotsByRun = new Map<Id<"agentRuns">, CustomToolRunSnapshot[]>();
	for (const approvalItemId of task.activeApprovalIds) {
		const approval = await ctx.db.get(approvalItemId);
		if (!approval || approval.kind !== "approval") {
			throw new Error("Agent task has an invalid active approval link.");
		}
		if (
			approval.status === "pending" ||
			approval.continuationRunId !== continuationRunId ||
			approval.consumedAt !== undefined ||
			approval.approvalKind !== "tool"
		) {
			continue;
		}
		const toolItem = await ctx.db.get(approval.toolItemId);
		if (!toolItem || toolItem.kind !== "tool") {
			throw new Error("Tool approval has an invalid tool item link.");
		}
		const sourceTurn = await ctx.db.get(toolItem.turnId);
		if (!sourceTurn || sourceTurn.taskId !== task._id) {
			throw new Error("Tool approval crosses an agent task boundary.");
		}
		const sourceRun = await ctx.db.get(toolItem.runId);
		if (!sourceRun || sourceRun.turnId !== toolItem.turnId) {
			throw new Error("Tool approval has an invalid source run link.");
		}
		if (sourceRun.customToolSnapshotCreatedAt === undefined) {
			throw new Error(
				"Approval source run is missing its custom tool snapshot.",
			);
		}
		if (!snapshotsByRun.has(sourceRun._id)) {
			snapshotsByRun.set(
				sourceRun._id,
				await loadRunSnapshot(ctx, sourceRun._id),
			);
		}
	}
	return snapshotsByRun.size
		? mergeSourceRunSnapshots([...snapshotsByRun.values()])
		: null;
}

function mergeSourceRunSnapshots(snapshots: CustomToolRunSnapshot[][]) {
	const byName = new Map<string, CustomToolRunSnapshot>();
	const toolIds = new Set<Id<"agentCustomTools">>();
	for (const snapshot of snapshots.flat()) {
		const existingByName = byName.get(snapshot.normalizedName);
		if (
			(existingByName &&
				JSON.stringify(existingByName) !== JSON.stringify(snapshot)) ||
			(!existingByName && toolIds.has(snapshot.toolId))
		) {
			throw new Error(
				`Conflicting custom tool snapshots for ${snapshot.normalizedName}.`,
			);
		}
		if (!existingByName) byName.set(snapshot.normalizedName, snapshot);
		toolIds.add(snapshot.toolId);
	}
	if (byName.size > MAX_CUSTOM_TOOLS_PER_ORGANIZATION) {
		throw new Error("Agent run custom tool snapshot exceeds its limit.");
	}
	return [...byName.values()];
}

export const loadRunnableToolsForRun = mutation({
	args: {
		runtimeSecret: v.string(),
		runId: v.id("agentRuns"),
		claimToken: v.string(),
	},
	returns: v.array(customToolRuntimeDefinitionValidator),
	handler: async (ctx, args) => {
		requireAgentRuntimeSecret(args.runtimeSecret);
		const { run, task } = await requireClaimedAgentRun(ctx, args);
		if (run.customToolSnapshotCreatedAt !== undefined) {
			return await runtimeDefinitionsWithCurrentNames(
				ctx,
				await loadRunSnapshot(ctx, run._id),
			);
		}

		let snapshot = await loadApprovalContinuationSnapshot(ctx, task, run._id);
		if (!snapshot) {
			const integrations = await loadOrganizationIntegrations(
				ctx,
				task.organizationId,
			);
			const organizationTools = await loadOrganizationTools(ctx, integrations);
			snapshot = await createCurrentRunSnapshot(
				organizationTools,
				task.agentKey,
			);
		}

		for (const definition of snapshot) {
			await ctx.db.insert("agentRunCustomToolDefinitions", {
				runId: run._id,
				...definition,
			});
		}
		await ctx.db.patch(run._id, {
			customToolSnapshotCreatedAt: Date.now(),
		});
		return await runtimeDefinitionsWithCurrentNames(ctx, snapshot);
	},
});
