import {
	IconAddressBook,
	IconCheck,
	IconChevronDown,
	IconChevronRight,
	IconFolder,
	IconFolderFilled,
	IconInbox,
	IconSettings,
	IconSettingsFilled,
} from "@tabler/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { useRef } from "react";
import {
	CASE_VIEW_FILTER_OPTIONS,
	CaseViewIndicator,
	isCaseViewFilter,
} from "#/components/case/case-status.tsx";
import { SidebarUserMenu } from "#/components/sidebar-user-menu.tsx";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "#/components/ui/collapsible.tsx";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";
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
	const inboxMenuPortalRef = useRef<HTMLElement | null>(null);
	const hasInboxChoices = inboxes.length > 1;
	const totalUnreadCount = inboxes.reduce(
		(total, inbox) => total + inbox.unreadCount,
		0,
	);

	return (
		<SidebarGroup>
			<SidebarGroupContent>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							isActive={isActive}
							tooltip={`Inboxes (${totalUnreadCount} unread)`}
							className={cn(
								hasInboxChoices ? "pr-14" : "pr-8",
								isActive ? "text-foreground" : "text-muted-foreground",
							)}
							render={<Link to="/email" search={{}} />}
						>
							<IconInbox />
							<span>Inboxes</span>
						</SidebarMenuButton>
						<SidebarMenuBadge
							className={cn(
								hasInboxChoices ? "right-8" : "right-2",
								"top-1/2! -translate-y-1/2 font-normal text-muted-foreground text-xs peer-hover/menu-button:text-muted-foreground peer-data-active/menu-button:text-muted-foreground",
							)}
							aria-label={`${totalUnreadCount} unread`}
						>
							{totalUnreadCount}
						</SidebarMenuBadge>
						{hasInboxChoices && (
							<DropdownMenu>
								<DropdownMenuTrigger
									render={
										<SidebarMenuAction
											aria-label="Select inbox"
											title="Select inbox"
											ref={(node) => {
												inboxMenuPortalRef.current =
													node?.closest<HTMLElement>('[role="dialog"]') ?? null;
											}}
										/>
									}
								>
									<IconChevronDown />
								</DropdownMenuTrigger>
								<DropdownMenuContent
									side="right"
									align="start"
									sideOffset={8}
									container={inboxMenuPortalRef}
									className="w-64"
								>
									{inboxes.map((inbox) => (
										<DropdownMenuItem
											key={inbox._id}
											render={
												<Link to="/email" search={{ inbox: inbox._id }} />
											}
										>
											<IconInbox />
											<span className="flex min-w-0 flex-1 flex-col">
												<span className="truncate font-medium">
													{inbox.displayName}
												</span>
												<span className="truncate text-xs text-muted-foreground">
													{inbox.address}
												</span>
											</span>
											<span className="ml-auto flex items-center gap-2">
												<span
													className="min-w-5 text-right font-normal text-muted-foreground text-xs tabular-nums"
													aria-label={`${inbox.unreadCount} unread`}
												>
													{inbox.unreadCount}
												</span>
												<span className="flex size-4 items-center justify-center">
													{selectedInboxId === inbox._id && <IconCheck />}
												</span>
											</span>
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</SidebarMenuItem>
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
	const location = useRouterState({
		select: (state) => state.location,
	});
	const pathname = location.pathname;
	const emailIsActive = pathname === "/email";
	const contactsIsActive = pathname === "/contacts";
	const casesIsActive = pathname === "/cases";
	const settingsEmailIsActive = pathname === "/settings/organization/email";
	const settingsEntitiesIsActive =
		pathname === "/settings/organization/entities";
	const settingsIsActive = pathname.startsWith("/settings");
	const CasesIcon = casesIsActive ? IconFolderFilled : IconFolder;
	const SettingsIcon = settingsIsActive ? IconSettingsFilled : IconSettings;
	const selectedCaseView = isCaseViewFilter(location.search.view)
		? location.search.view
		: "all";

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
							<Collapsible
								defaultOpen={casesIsActive}
								render={<SidebarMenuItem />}
							>
								<SidebarMenuButton
									isActive={casesIsActive}
									tooltip="Cases"
									className={cn(
										"pr-8",
										casesIsActive ? "text-foreground" : "text-muted-foreground",
									)}
									render={<Link to="/cases" search={{}} />}
								>
									<CasesIcon />
									<span>Cases</span>
								</SidebarMenuButton>
								<CollapsibleTrigger
									render={
										<SidebarMenuAction
											aria-label="Toggle case views"
											title="Toggle case views"
											className="group/collapsible"
										/>
									}
								>
									<IconChevronRight className="ml-auto transition-transform duration-200 group-data-panel-open/collapsible:rotate-90" />
								</CollapsibleTrigger>
								<CollapsibleContent>
									<SidebarMenuSub>
										{CASE_VIEW_FILTER_OPTIONS.map((option) => (
											<SidebarMenuSubItem key={option.value}>
												<SidebarMenuSubButton
													isActive={
														casesIsActive && selectedCaseView === option.value
													}
													render={
														<Link
															to="/cases"
															search={{
																view: option.value,
															}}
														/>
													}
												>
													<span className="flex size-4 items-center justify-center">
														<CaseViewIndicator view={option.value} />
													</span>
													<span>{option.label}</span>
												</SidebarMenuSubButton>
											</SidebarMenuSubItem>
										))}
									</SidebarMenuSub>
								</CollapsibleContent>
							</Collapsible>
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
