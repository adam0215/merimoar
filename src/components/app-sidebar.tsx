import { IconBuilding, IconChevronRight, IconMail } from "@tabler/icons-react";
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
	SidebarHeader,
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

	return (
		<Sidebar variant="inset" collapsible="icon">
			<SidebarHeader className="pt-3">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							asChild
							size="lg"
							tooltip="Merimoar"
							className="hover:bg-transparent active:bg-transparent"
						>
							<Link to="/email" search={{}}>
								<span className="flex size-9 items-center justify-center rounded-xl bg-foreground">
									<img
										src="/logo/merimoar_logo.svg"
										alt=""
										className="size-6 invert dark:invert-0"
									/>
								</span>
								<span className="text-base font-semibold tracking-tight">
									Merimoar
								</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton
									asChild
									isActive={emailIsActive}
									tooltip="Email"
								>
									<Link to="/email" search={{}}>
										<IconMail />
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
										>
											<IconBuilding />
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
