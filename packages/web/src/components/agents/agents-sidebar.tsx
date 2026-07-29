import { Link } from "@tanstack/react-router";
import {
	AGENT_NAV_ITEMS,
	type AgentView,
} from "#/components/agents/agent-navigation.ts";
import { SidebarUserMenu } from "#/components/sidebar-user-menu.tsx";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "#/components/ui/sidebar.tsx";

export function AgentsSidebar({ selectedView }: { selectedView: AgentView }) {
	return (
		<Sidebar variant="sidebar" collapsible="icon">
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Workspace</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{AGENT_NAV_ITEMS.map((item) => {
								const isActive = item.view === selectedView;

								return (
									<SidebarMenuItem key={item.view}>
										<SidebarMenuButton
											isActive={isActive}
											tooltip={item.label}
											className={
												isActive ? "text-foreground" : "text-muted-foreground"
											}
											render={
												<Link to="/agents" search={{ view: item.view }} />
											}
										>
											<item.icon />
											<span>{item.label}</span>
										</SidebarMenuButton>
									</SidebarMenuItem>
								);
							})}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter>
				<SidebarUserMenu />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
