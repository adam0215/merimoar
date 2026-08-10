import { valibotSchema } from "@ai-sdk/valibot";
import { tool } from "ai";
import * as v from "valibot";
import type { AgentContext } from "../../types";
import { identifierSchema } from "../schema";

export const emailBodySchema = v.pipe(
	v.string(),
	v.maxLength(50_000),
	v.regex(/\S/, "Email body is required."),
);

export function createSendEmailTool(context: AgentContext) {
	return tool({
		description:
			"Send the proposed reply in an email thread that is actively related to the delegated case. The exact thread and body require member approval before anything is queued.",
		inputSchema: valibotSchema(
			v.strictObject({
				threadId: identifierSchema,
				body: emailBodySchema,
			}),
		),
		needsApproval: true,
		execute: (input, options) =>
			context.capabilities.sendEmail(input, options.toolCallId),
	});
}
