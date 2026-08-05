export type AgentDefinition = {
	key: string;
	name: string;
	description: string;
	defaultModel: string;
	builtInTools: readonly string[];
};

export const agentManifest = {
	"agent-v1": {
		key: "agent-v1",
		name: "Merimoar",
		description: "A general Merimoar colleague for manually delegated work.",
		defaultModel: "gpt-5.6-luna",
		builtInTools: [
			"global_search",
			"inspect_entity",
			"inspect_contact",
			"read_case",
			"create_case",
			"update_case",
			"add_case_relation",
			"search_emails",
			"read_email_thread",
			"update_activity",
			"update_task_status",
		],
	},
} as const satisfies Record<string, AgentDefinition>;

export const defaultAgentDefinition = agentManifest["agent-v1"];
export type BuiltInToolKey =
	(typeof defaultAgentDefinition.builtInTools)[number];
