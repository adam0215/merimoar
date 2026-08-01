import { valibotSchema } from "@ai-sdk/valibot";
import { tool } from "ai";
import * as v from "valibot";
import type { AgentContext } from "../../types";
import { identifierSchema } from "../schema";

export function createInspectEntityTool(context: AgentContext) {
	return tool({
		description:
			"Inspect one entity's type definition, configured fields, and current values after finding it in search.",
		inputSchema: valibotSchema(
			v.strictObject({
				entityId: identifierSchema,
			}),
		),
		execute: (input) => context.capabilities.inspectEntity(input),
	});
}
