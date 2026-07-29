import { IconListCheck, IconRobot, IconTools } from "@tabler/icons-react";

export const AGENT_NAV_ITEMS = [
	{
		view: "tasks",
		label: "Tasks",
		emptyLabel: "No tasks yet",
		icon: IconListCheck,
	},
	{
		view: "agents",
		label: "Agents",
		emptyLabel: "No agents yet",
		icon: IconRobot,
	},
	{
		view: "tools",
		label: "Tools",
		emptyLabel: "No tools yet",
		icon: IconTools,
	},
] as const;

export type AgentView = (typeof AGENT_NAV_ITEMS)[number]["view"];

export function isAgentView(value: unknown): value is AgentView {
	return AGENT_NAV_ITEMS.some((item) => item.view === value);
}

export function getAgentNavItem(view: AgentView) {
	return (
		AGENT_NAV_ITEMS.find((item) => item.view === view) ?? AGENT_NAV_ITEMS[0]
	);
}
