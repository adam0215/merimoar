import {
	IconChevronRight,
	IconMail,
	IconMailFilled,
	IconSettings,
	IconSettingsFilled,
} from "@tabler/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "#/components/ui/collapsible.tsx";
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
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarRail,
} from "#/components/ui/sidebar.tsx";

export function AppSidebar() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const emailIsActive = pathname === "/email";
	const settingsEmailIsActive = pathname === "/settings/organization/email";
	const settingsIsActive = pathname.startsWith("/settings");
	const MailIcon = emailIsActive ? IconMailFilled : IconMail;
	const SettingsIcon = settingsIsActive ? IconSettingsFilled : IconSettings;

	return (
		<Sidebar variant="sidebar" collapsible="icon">
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Menu</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton
									asChild
									isActive={emailIsActive}
									tooltip="Email"
									className={
										emailIsActive ? "text-foreground" : "text-muted-foreground"
									}
								>
									<Link to="/email" search={{}}>
										<MailIcon />
										<span>Email</span>
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter>
				<SidebarGroup className="p-0">
					<SidebarGroupLabel>Settings</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							<Collapsible
								asChild
								defaultOpen={settingsIsActive}
								className="group/collapsible"
							>
								<SidebarMenuItem>
									<CollapsibleTrigger asChild>
										<SidebarMenuButton
											tooltip="Organization"
											isActive={settingsIsActive}
											className={
												settingsIsActive
													? "text-foreground"
													: "text-muted-foreground"
											}
										>
											<SettingsIcon />
											<span>Organization</span>
											<IconChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
										</SidebarMenuButton>
									</CollapsibleTrigger>
									<CollapsibleContent>
										<SidebarMenuSub>
											<SidebarMenuSubItem>
												<SidebarMenuSubButton
													asChild
													isActive={settingsEmailIsActive}
													className={
														settingsEmailIsActive
															? "text-foreground"
															: "text-muted-foreground"
													}
												>
													<Link to="/settings/organization/email">
														<span>Email</span>
													</Link>
												</SidebarMenuSubButton>
											</SidebarMenuSubItem>
										</SidebarMenuSub>
									</CollapsibleContent>
								</SidebarMenuItem>
							</Collapsible>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
