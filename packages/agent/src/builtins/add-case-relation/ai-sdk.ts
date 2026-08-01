import { valibotSchema } from "@ai-sdk/valibot";
import { tool } from "ai";
import * as v from "valibot";
import type { AgentContext } from "../../types";
import { identifierSchema } from "../schema";

export function createAddCaseRelationTool(context: AgentContext) {
	return tool({
		description:
			"Relate a verified contact, entity, case, or email thread to a case. Find candidates with global_search or search_emails, inspect or read the selected record to confirm relevance, then use the exact returned identifier. Add every directly relevant relation, not merely the first match.",
		inputSchema: valibotSchema(
			v.strictObject({
				caseId: identifierSchema,
				relation: v.variant("kind", [
					v.strictObject({
						kind: v.literal("contact"),
						contactId: identifierSchema,
					}),
					v.strictObject({
						kind: v.literal("entity"),
						entityId: identifierSchema,
					}),
					v.strictObject({
						kind: v.literal("case"),
						relatedCaseId: identifierSchema,
					}),
					v.strictObject({
						kind: v.literal("email_thread"),
						threadId: identifierSchema,
					}),
				]),
			}),
		),
		execute: (input, options) =>
			context.capabilities.addCaseRelation(input, options.toolCallId),
	});
}
