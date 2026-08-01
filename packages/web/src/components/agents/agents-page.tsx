import type { AgentView } from "#/components/agents/agent-navigation.ts";
import { AgentTaskInspector } from "#/components/agents/agent-task-inspector.tsx";
import {
	AgentOverview,
	AgentTasks,
	AgentToolsPage,
} from "#/components/agents/agent-workspace.tsx";

export function AgentsPage({
	view,
	taskId,
}: {
	view: AgentView;
	taskId?: string;
}) {
	if (taskId) {
		return <AgentTaskInspector key={taskId} taskId={taskId} />;
	}

	if (view === "tasks") {
		return <AgentTasks />;
	}
	if (view === "tools") {
		return <AgentToolsPage />;
	}
	return <AgentOverview />;
}
