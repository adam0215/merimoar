import { api } from "@merimoar/convex/api";
import {
	IconAddressBook,
	IconChevronRight,
	IconFolder,
	IconFolderFilled,
	IconHome,
	IconInbox,
	IconPlus,
	IconRobot,
	IconSettings,
	IconSettingsFilled,
} from "@tabler/icons-react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex-helpers/react/cache";
import { useState } from "react";
import {
	CASE_VIEW_FILTER_OPTIONS,
	CaseViewIndicator,
	isCaseViewFilter,
} from "#/components/case/case-status.tsx";
import { CreateCaseDialog } from "#/components/case/create-case-dialog.tsx";
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

type EmailInbox = FunctionReturnType<
	typeof api.email.reader.listInboxes
>[number];

function PrimaryNavigationSidebarGroup({
	inboxes,
	selectedInboxId,
	overviewIsActive,
	emailIsActive,
	agentInboxIsActive,
	agentInboxCount,
}: {
	inboxes: EmailInbox[];
	selectedInboxId?: string;
	overviewIsActive: boolean;
	emailIsActive: boolean;
	agentInboxIsActive: boolean;
	agentInboxCount: number;
}) {
	const hasInboxes = inboxes.length > 0;
	const totalUnreadCount = inboxes.reduce(
		(total, inbox) => total + inbox.unreadCount,
		0,
	);
	const agentInboxAttentionLabel =
		agentInboxCount === 1
			? "1 item needs attention"
			: `${agentInboxCount} items need attention`;

	return (
		<SidebarGroup>
			<SidebarGroupContent>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							isActive={overviewIsActive}
							tooltip="My overview"
							className={
								overviewIsActive ? "text-foreground" : "text-muted-foreground"
							}
							render={<Link to="/" search={{}} />}
						>
							<IconHome />
							<span>My overview</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
					<Collapsible
						key={emailIsActive ? "email-active" : "email-inactive"}
						defaultOpen={emailIsActive}
						render={<SidebarMenuItem />}
					>
						<div className="relative">
							<SidebarMenuButton
								isActive={emailIsActive}
								tooltip={`Inboxes (${totalUnreadCount} unread)`}
								className={cn(
									hasInboxes ? "pr-14" : "pr-8",
									emailIsActive ? "text-foreground" : "text-muted-foreground",
								)}
								render={<Link to="/email" search={{}} />}
							>
								<IconInbox />
								<span>Inboxes</span>
							</SidebarMenuButton>
							<SidebarMenuBadge
								className={cn(
									hasInboxes ? "right-7" : "right-2",
									"top-1/2! w-5 -translate-y-1/2 px-0 font-normal text-muted-foreground text-xs peer-hover/menu-button:text-muted-foreground peer-data-active/menu-button:text-muted-foreground",
								)}
								aria-label={`${totalUnreadCount} unread`}
							>
								{totalUnreadCount}
							</SidebarMenuBadge>
							{hasInboxes && (
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
							)}
						</div>
						{hasInboxes && (
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
						)}
					</Collapsible>
					<SidebarMenuItem>
						<SidebarMenuButton
							isActive={agentInboxIsActive}
							tooltip={`Agent inbox (${agentInboxAttentionLabel})`}
							className={cn(
								"pr-8",
								agentInboxIsActive
									? "text-foreground"
									: "text-muted-foreground",
							)}
							render={<Link to="/agent-inbox" search={{}} />}
						>
							<IconRobot />
							<span>Agent inbox</span>
						</SidebarMenuButton>
						{agentInboxCount > 0 && (
							<SidebarMenuBadge
								className="right-2 top-1/2! translate-x-px -translate-y-1/2 justify-end px-0 font-normal text-muted-foreground text-xs"
								aria-label={agentInboxAttentionLabel}
							>
								{agentInboxCount}
							</SidebarMenuBadge>
						)}
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}

export function WorkSidebar({
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
	const overviewIsActive = pathname === "/";
	const emailIsActive = pathname === "/email";
	const agentInboxIsActive = pathname === "/agent-inbox";
	const contactsIsActive = pathname === "/contacts";
	const casesIsActive = pathname === "/cases";
	const settingsEmailIsActive = pathname === "/settings/organization/email";
	const settingsGeneralIsActive = pathname === "/settings/organization/general";
	const settingsEntitiesIsActive =
		pathname === "/settings/organization/entities";
	const settingsIsActive = pathname.startsWith("/settings");
	const CasesIcon = casesIsActive ? IconFolderFilled : IconFolder;
	const SettingsIcon = settingsIsActive ? IconSettingsFilled : IconSettings;
	const selectedCaseView = isCaseViewFilter(location.search.view)
		? location.search.view
		: "all";
	const navigate = useNavigate();
	const [createCaseDialogOpen, setCreateCaseDialogOpen] = useState(false);
	const createCaseOptions = useQuery(
		api.case.reader.getCreateOptions,
		createCaseDialogOpen ? {} : "skip",
	);
	const pendingApprovals = useQuery(api.agent.reader.listPendingApprovals, {});
	const agentInboxCount =
		pendingApprovals?.reduce(
			(total, group) => total + group.approvals.length,
			0,
		) ?? 0;

	return (
		<Sidebar variant="sidebar" collapsible="icon">
			<SidebarContent className="gap-0">
				<PrimaryNavigationSidebarGroup
					inboxes={inboxes}
					selectedInboxId={selectedInboxId}
					overviewIsActive={overviewIsActive}
					emailIsActive={emailIsActive}
					agentInboxIsActive={agentInboxIsActive}
					agentInboxCount={agentInboxCount}
				/>

				<SidebarGroup className="pt-4">
					<SidebarGroupLabel>Case management</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							<Collapsible
								key={casesIsActive ? "cases-active" : "cases-inactive"}
								defaultOpen={casesIsActive}
								render={<SidebarMenuItem />}
							>
								<SidebarMenuButton
									isActive={casesIsActive}
									tooltip="Cases"
									className={cn(
										"pr-14",
										casesIsActive ? "text-foreground" : "text-muted-foreground",
									)}
									render={<Link to="/cases" search={{}} />}
								>
									<CasesIcon />
									<span>Cases</span>
								</SidebarMenuButton>
								<CreateCaseDialog
									options={createCaseOptions}
									open={createCaseDialogOpen}
									onOpenChange={setCreateCaseDialogOpen}
									onCreated={(caseId) =>
										void navigate({
											to: "/cases",
											search: {
												case: caseId,
												view:
													casesIsActive && selectedCaseView !== "all"
														? selectedCaseView
														: undefined,
											},
										})
									}
									trigger={
										<SidebarMenuAction
											aria-label="Create case"
											title="Create case"
											className="right-7"
										>
											<IconPlus />
										</SidebarMenuAction>
									}
								/>
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
								key={settingsIsActive ? "settings-active" : "settings-inactive"}
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
												isActive={settingsGeneralIsActive}
												className={
													settingsGeneralIsActive
														? "text-foreground"
														: "text-muted-foreground"
												}
												render={<Link to="/settings/organization/general" />}
											>
												<span>General</span>
											</SidebarMenuSubButton>
										</SidebarMenuSubItem>
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
