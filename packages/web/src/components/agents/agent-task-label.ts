import type { Id } from "@merimoar/convex/data-model";

export function formatAgentTaskLabel(taskId: Id<"agentTasks">) {
	return `Task ${taskId.slice(-8)}`;
}
