import { valibotSchema } from "@ai-sdk/valibot";
import { tool } from "ai";
import * as v from "valibot";
import type { AgentContext } from "../../types";

const globalSearchInputSchema = v.strictObject({
	searchQuery: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
	filter: v.variant("kind", [
		v.strictObject({ kind: v.literal("all") }),
		v.strictObject({ kind: v.literal("cases") }),
		v.strictObject({ kind: v.literal("entities") }),
		v.strictObject({
			kind: v.literal("entity_type"),
			entityTypeKey: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
		}),
	]),
});

export function createGlobalSearchTool(context: AgentContext) {
	return tool({
		description:
			"Search this organization for cases, contacts, and entities. Use an entity_type filter for one configured entity type.",
		inputSchema: valibotSchema(globalSearchInputSchema),
		execute: (input) => context.capabilities.search(input),
	});
}
