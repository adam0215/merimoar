import { jsonSchema, type Tool, tool } from "ai";
import { createBuiltInTools } from "./builtins";
import type { AgentContext, CustomToolDefinition } from "./types";

function createCustomTool(
	context: AgentContext,
	definition: CustomToolDefinition,
) {
	const properties = Object.fromEntries(
		definition.parameters.map((parameter) => [
			parameter.name,
			{ type: parameter.type, description: parameter.description },
		]),
	);
	return tool({
		description: definition.description,
		inputSchema: jsonSchema<Record<string, unknown>>({
			type: "object",
			properties,
			required: definition.parameters
				.filter((parameter) => parameter.required)
				.map((parameter) => parameter.name),
			additionalProperties: false,
		}),
		needsApproval: definition.requiresApproval,
		execute: (input) =>
			context.capabilities.invokeCustomTool(definition.toolId, input),
	});
}

export function createAgentTools(
	context: AgentContext,
	customTools: readonly CustomToolDefinition[],
) {
	const builtInTools = createBuiltInTools(context);
	const tools: Record<string, Tool> = { ...builtInTools };
	for (const definition of customTools) {
		if (definition.normalizedName in tools) {
			throw new Error(
				`Duplicate agent tool name: ${definition.normalizedName}`,
			);
		}
		tools[definition.normalizedName] = createCustomTool(context, definition);
	}
	return Object.freeze(tools);
}
