import { valibotSchema } from "@ai-sdk/valibot";
import { tool } from "ai";
import * as v from "valibot";
import { type AgentContext, CASE_STATUSES } from "../../types";
import { caseTitleSchema, identifierSchema } from "../schema";

export function createUpdateCaseTool(context: AgentContext) {
	return tool({
		description:
			"Update the selected case's title, description, due date, or status without changing its human owner. Put durable case context and conclusions in the description. Description and status changes are recorded automatically in case history.",
		inputSchema: valibotSchema(
			v.strictObject({
				caseId: identifierSchema,
				title: v.optional(caseTitleSchema),
				description: v.optional(v.string()),
				dueAt: v.optional(v.nullable(v.number())),
				status: v.optional(v.picklist(CASE_STATUSES)),
			}),
		),
		execute: (input, options) =>
			context.capabilities.updateCase(input, options.toolCallId),
	});
}
