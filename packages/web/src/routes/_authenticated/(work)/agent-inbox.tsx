import { createFileRoute } from "@tanstack/react-router";
import { AgentInboxPage } from "#/components/agents/agent-inbox-page.tsx";

export const Route = createFileRoute("/_authenticated/(work)/agent-inbox")({
	component: AgentInboxPage,
});
