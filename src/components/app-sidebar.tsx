import {
	IconAddressBook,
	IconChevronRight,
	IconFolder,
	IconFolderFilled,
	IconMail,
	IconMailFilled,
	IconSettings,
	IconSettingsFilled,
} from "@tabler/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { SidebarUserMenu } from "#/components/sidebar-user-menu.tsx";
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
	const contactsIsActive = pathname === "/contacts";
	const casesIsActive = pathname === "/cases";
	const settingsEmailIsActive = pathname === "/settings/organization/email";
	const settingsEntitiesIsActive =
		pathname === "/settings/organization/entities";
	const settingsIsActive = pathname.startsWith("/settings");
	const MailIcon = emailIsActive ? IconMailFilled : IconMail;
	const CasesIcon = casesIsActive ? IconFolderFilled : IconFolder;
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
									isActive={casesIsActive}
									tooltip="Cases"
									className={
										casesIsActive ? "text-foreground" : "text-muted-foreground"
									}
									render={<Link to="/cases" search={{}} />}
								>
									<CasesIcon />
									<span>Cases</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
							<SidebarMenuItem>
								<SidebarMenuButton
									isActive={emailIsActive}
									tooltip="Email"
									className={
										emailIsActive ? "text-foreground" : "text-muted-foreground"
									}
									render={<Link to="/email" search={{}} />}
								>
									<MailIcon />
									<span>Email</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
							<SidebarMenuItem>
								<SidebarMenuButton
									isActive={contactsIsActive}
									tooltip="Contacts"
									className={
										contactsIsActive
											? "text-foreground"
											: "text-muted-foreground"
									}
									render={<Link to="/contacts" search={{}} />}
								>
									<IconAddressBook />
									<span>Contacts</span>
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
								defaultOpen={settingsIsActive}
								render={<SidebarMenuItem />}
							>
								<CollapsibleTrigger
									render={
										<SidebarMenuButton
											tooltip="Organization"
											isActive={settingsIsActive}
											className={
												settingsIsActive
													? "group/collapsible text-foreground"
													: "group/collapsible text-muted-foreground"
											}
										/>
									}
								>
									<SettingsIcon />
									<span>Organization</span>
									<IconChevronRight className="ml-auto transition-transform duration-200 group-data-panel-open/collapsible:rotate-90" />
								</CollapsibleTrigger>
								<CollapsibleContent>
									<SidebarMenuSub>
										<SidebarMenuSubItem>
											<SidebarMenuSubButton
												isActive={settingsEntitiesIsActive}
												className={
													settingsEntitiesIsActive
														? "text-foreground"
														: "text-muted-foreground"
												}
												render={
													<Link
														to="/settings/organization/entities"
														search={{}}
													/>
												}
											>
												<span>Entities</span>
											</SidebarMenuSubButton>
										</SidebarMenuSubItem>
										<SidebarMenuSubItem>
											<SidebarMenuSubButton
												isActive={settingsEmailIsActive}
												className={
													settingsEmailIsActive
														? "text-foreground"
														: "text-muted-foreground"
												}
												render={<Link to="/settings/organization/email" />}
											>
												<span>Email</span>
											</SidebarMenuSubButton>
										</SidebarMenuSubItem>
									</SidebarMenuSub>
								</CollapsibleContent>
							</Collapsible>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
				<SidebarUserMenu />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
