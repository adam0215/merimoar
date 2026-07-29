import { createFileRoute } from "@tanstack/react-router";
import {
	type AgentView,
	isAgentView,
} from "#/components/agents/agent-navigation.ts";
import { AgentsPage } from "#/components/agents/agents-page.tsx";

type AgentsSearch = {
	view?: AgentView;
};

export const Route = createFileRoute("/_authenticated/(agents)/agents")({
	validateSearch: (search: Record<string, unknown>): AgentsSearch => ({
		view: isAgentView(search.view) ? search.view : undefined,
	}),
	component: AgentsRoute,
});

function AgentsRoute() {
	const { view = "tasks" } = Route.useSearch();

	return <AgentsPage view={view} />;
}
