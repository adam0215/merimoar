import { valibotSchema } from "@ai-sdk/valibot";
import { tool } from "ai";
import * as v from "valibot";
import type { AgentContext } from "../../types";
import { identifierSchema } from "../schema";

export function createReadEmailThreadTool(context: AgentContext) {
	return tool({
		description:
			"Read the selected organization email thread in chronological detail.",
		inputSchema: valibotSchema(
			v.strictObject({
				threadId: identifierSchema,
			}),
		),
		execute: (input) => context.capabilities.readEmailThread(input),
	});
}
