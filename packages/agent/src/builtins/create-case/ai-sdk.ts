import { valibotSchema } from "@ai-sdk/valibot";
import { tool } from "ai";
import * as v from "valibot";
import type { AgentContext } from "../../types";
import { caseTitleSchema } from "../schema";

export function createCreateCaseTool(context: AgentContext) {
	return tool({
		description:
			"Create a related case in this organization. This is an internal, reversible change and does not need approval.",
		inputSchema: valibotSchema(
			v.strictObject({
				title: caseTitleSchema,
				description: v.string(),
				dueAt: v.nullable(v.number()),
			}),
		),
		execute: (input, options) =>
			context.capabilities.createCase(input, options.toolCallId),
	});
}
