import { valibotSchema } from "@ai-sdk/valibot";
import { tool } from "ai";
import * as v from "valibot";
import type { AgentContext } from "../../types";
import { identifierSchema } from "../schema";

export function createInspectContactTool(context: AgentContext) {
	return tool({
		description:
			"Inspect a contact, their recent inbound email summaries, and related cases after finding them in search.",
		inputSchema: valibotSchema(
			v.strictObject({
				contactId: identifierSchema,
			}),
		),
		execute: (input) => context.capabilities.inspectContact(input),
	});
}
