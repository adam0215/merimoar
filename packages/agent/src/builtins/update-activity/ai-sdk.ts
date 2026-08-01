import { valibotSchema } from "@ai-sdk/valibot";
import { tool } from "ai";
import * as v from "valibot";
import type { AgentContext } from "../../types";

export const updateActivityInputSchema = v.strictObject({
	title: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
	detail: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(2_000))),
});

export function createUpdateActivityTool(context: AgentContext) {
	return tool({
		description:
			"Update the high-level activity people can follow. Use it only when your current intention changes, not for every tool call.",
		inputSchema: valibotSchema(updateActivityInputSchema),
		execute: (input) => executeUpdateActivity(context, input),
	});
}

export async function executeUpdateActivity(
	context: AgentContext,
	input: { title: string; detail?: string },
) {
	await context.capabilities.updateActivity(input);
	return { updated: true };
}
