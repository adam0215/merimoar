import {
	IconAddressBook,
	IconChevronRight,
	IconFolder,
	IconFolderFilled,
	IconInbox,
	IconSettings,
	IconSettingsFilled,
} from "@tabler/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
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
	SidebarMenuAction,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarRail,
} from "#/components/ui/sidebar.tsx";
import { cn } from "#/lib/utils.ts";
import { api } from "../../convex/_generated/api";

type EmailInbox = FunctionReturnType<
	typeof api.email.reader.listInboxes
>[number];

function InboxSidebarGroup({
	inboxes,
	selectedInboxId,
	isActive,
}: {
	inboxes: EmailInbox[];
	selectedInboxId?: string;
	isActive: boolean;
}) {
	const hasInboxes = inboxes.length > 0;
	const totalUnreadCount = inboxes.reduce(
		(total, inbox) => total + inbox.unreadCount,
		0,
	);

	return (
		<SidebarGroup>
			<SidebarGroupContent>
				<SidebarMenu>
					<Collapsible defaultOpen={isActive} render={<SidebarMenuItem />}>
						<SidebarMenuButton
							isActive={isActive}
							tooltip={`Inboxes (${totalUnreadCount} unread)`}
							className={cn(
								hasInboxes ? "pr-14" : "pr-8",
								isActive ? "text-foreground" : "text-muted-foreground",
							)}
							render={<Link to="/email" search={{}} />}
						>
							<IconInbox />
							<span>Inboxes</span>
						</SidebarMenuButton>
						<SidebarMenuBadge
							className={cn(
								hasInboxes ? "right-8" : "right-2",
								"font-normal text-muted-foreground text-xs peer-hover/menu-button:text-muted-foreground peer-data-active/menu-button:text-muted-foreground",
							)}
							aria-label={`${totalUnreadCount} unread`}
						>
							{totalUnreadCount}
						</SidebarMenuBadge>
						{hasInboxes && (
							<>
								<CollapsibleTrigger
									render={
										<SidebarMenuAction
											aria-label="Toggle inboxes"
											title="Toggle inboxes"
											className="group/collapsible"
										/>
									}
								>
									<IconChevronRight className="transition-transform duration-200 group-data-panel-open/collapsible:rotate-90" />
								</CollapsibleTrigger>
								<CollapsibleContent>
									<SidebarMenuSub>
										{inboxes.map((inbox) => {
											const inboxIsActive = selectedInboxId === inbox._id;

											return (
												<SidebarMenuSubItem key={inbox._id}>
													<SidebarMenuSubButton
														isActive={inboxIsActive}
														className={
															inboxIsActive
																? "text-foreground"
																: "text-muted-foreground"
														}
														render={
															<Link to="/email" search={{ inbox: inbox._id }} />
														}
													>
														<span className="min-w-0 flex-1 truncate">
															{inbox.displayName}
														</span>
														<span
															className="ml-auto min-w-5 shrink-0 text-right font-normal text-muted-foreground text-xs tabular-nums"
															aria-label={`${inbox.unreadCount} unread`}
														>
															{inbox.unreadCount}
														</span>
													</SidebarMenuSubButton>
												</SidebarMenuSubItem>
											);
										})}
									</SidebarMenuSub>
								</CollapsibleContent>
							</>
						)}
					</Collapsible>
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}

export function AppSidebar({
	inboxes,
	selectedInboxId,
}: {
	inboxes: EmailInbox[];
	selectedInboxId?: string;
}) {
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
	const CasesIcon = casesIsActive ? IconFolderFilled : IconFolder;
	const SettingsIcon = settingsIsActive ? IconSettingsFilled : IconSettings;

	return (
		<Sidebar variant="sidebar" collapsible="icon">
			<SidebarContent className="gap-0">
				<InboxSidebarGroup
					inboxes={inboxes}
					selectedInboxId={selectedInboxId}
					isActive={emailIsActive}
				/>

				<SidebarGroup className="pt-4">
					<SidebarGroupLabel>Case management</SidebarGroupLabel>
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
