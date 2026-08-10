import { type BuiltInToolKey, builtInToolKeys } from "./builtins/catalog";

export type AgentDefinition = {
	key: string;
	name: string;
	description: string;
	defaultModel: string;
	builtInTools: readonly BuiltInToolKey[];
};

export const agentManifest = {
	"agent-v1": {
		key: "agent-v1",
		name: "Merimoar",
		description: "A general Merimoar colleague for manually delegated work.",
		defaultModel: "gpt-5.6-luna",
		builtInTools: builtInToolKeys,
	},
} as const satisfies Record<string, AgentDefinition>;

export const defaultAgentDefinition = agentManifest["agent-v1"];
export type { BuiltInToolKey } from "./builtins/catalog";
