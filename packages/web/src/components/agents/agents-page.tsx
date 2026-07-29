import type { AgentView } from "#/components/agents/agent-navigation.ts";
import { getAgentNavItem } from "#/components/agents/agent-navigation.ts";

export function AgentsPage({ view }: { view: AgentView }) {
	const item = getAgentNavItem(view);

	return (
		<section className="flex h-full min-h-0 flex-col overflow-auto">
			<div className="flex min-h-full items-center justify-center p-6">
				<div className="flex flex-col items-center gap-3 text-center">
					<div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
						<item.icon className="size-5" />
					</div>
					<p className="text-sm font-medium">{item.emptyLabel}</p>
				</div>
			</div>
		</section>
	);
}
