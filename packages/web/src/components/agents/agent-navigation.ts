import {
	IconLayoutDashboard,
	IconListCheck,
	IconTool,
} from "@tabler/icons-react";

export const AGENT_NAV_ITEMS = [
	{
		view: "overview",
		label: "Overview",
		icon: IconLayoutDashboard,
	},
	{
		view: "tasks",
		label: "Tasks",
		icon: IconListCheck,
	},
	{
		view: "tools",
		label: "Tools",
		icon: IconTool,
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
