import { valibotSchema } from "@ai-sdk/valibot";
import { tool } from "ai";
import * as v from "valibot";
import type { AgentContext } from "../../types";

export function createSearchEmailsTool(context: AgentContext) {
	return tool({
		description:
			"Search bounded recent organization email beyond the anchor case and return relevant thread summaries.",
		inputSchema: valibotSchema(
			v.strictObject({
				searchQuery: v.pipe(v.string(), v.maxLength(100)),
			}),
		),
		execute: (input) => context.capabilities.searchEmails(input),
	});
}
