import { valibotSchema } from "@ai-sdk/valibot";
import { tool } from "ai";
import * as v from "valibot";
import type { AgentContext } from "../../types";
import { identifierSchema } from "../schema";

export function createReadCaseTool(context: AgentContext) {
	return tool({
		description:
			"Read a case, its recent history, relationships, and linked email threads.",
		inputSchema: valibotSchema(
			v.strictObject({
				caseId: identifierSchema,
			}),
		),
		execute: (input) => context.capabilities.readCase(input),
	});
}
