import { api } from "@merimoar/convex/api";
import { IconArtboard, IconBriefcase2 } from "@tabler/icons-react";
import {
	getRouteApi,
	Link,
	useNavigate,
	useRouterState,
} from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { useEffect, useState } from "react";
import {
	type AgentView,
	getAgentNavItem,
	isAgentView,
} from "#/components/agents/agent-navigation.ts";
import { AgentsSidebar } from "#/components/agents/agents-sidebar.tsx";
import { AppNotificationCenter } from "#/components/app-notification-center.tsx";
import { GlobalSearch } from "#/components/global-search.tsx";
import { MerimoarLogo } from "#/components/merimoar-logo.tsx";
import { OrganizationSwitcher } from "#/components/organization-switcher.tsx";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
	useSidebar,
} from "#/components/ui/sidebar.tsx";
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs.tsx";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip.tsx";
import { WorkSidebar } from "#/components/work/work-sidebar.tsx";
import type { AvailableOrganization } from "#/integrations/workos/organizations.ts";
import { cn } from "#/lib/utils.ts";

const authenticatedRoute = getRouteApi("/_authenticated");

function getPageTitle(pathname: string, agentView: AgentView) {
	if (isAgentsPath(pathname)) {
		return getAgentNavItem(agentView).label;
	}
	if (pathname === "/") {
		return "My overview";
	}
	if (pathname === "/settings/organization/entities") {
		return "Entity settings";
	}
	if (pathname === "/settings/organization/general") {
		return "General settings";
	}
	if (pathname === "/settings/organization/email") {
		return "Email settings";
	}
	if (pathname === "/cases") {
		return "Cases";
	}
	if (pathname === "/agent-inbox") {
		return "Agent inbox";
	}
	if (pathname === "/contacts") {
		return "Contacts";
	}
	if (pathname === "/profile") {
		return "Profile";
	}
	return "Email";
}

function isAgentsPath(pathname: string) {
	return pathname === "/agents" || pathname.startsWith("/agents/");
}

export function AppShell({
	children,
	organizations,
}: {
	children: React.ReactNode;
	organizations: AvailableOrganization[];
}) {
	const location = useRouterState({
		select: (state) => state.location,
	});
	const isAgentsArea = isAgentsPath(location.pathname);
	const agentView = isAgentView(location.search.view)
		? location.search.view
		: "overview";
	const inboxes = useQuery(
		api.email.reader.listInboxes,
		isAgentsArea ? "skip" : {},
	);
	const selectedInboxId =
		location.pathname === "/email" ? location.search.inbox : undefined;
	const visibleInboxes = selectedInboxId
		? inboxes?.filter((inbox) => inbox._id === selectedInboxId)
		: inboxes;
	const inboxAddresses = visibleInboxes?.map((inbox) => inbox.address) ?? [];

	return (
		<SidebarProvider className="app-shell-enter pt-14">
			<AppNotificationCenter />
			{isAgentsArea ? (
				<AgentsSidebar selectedView={agentView} />
			) : (
				<WorkSidebar
					inboxes={inboxes ?? []}
					selectedInboxId={selectedInboxId}
				/>
			)}
			<AppHeader
				pathname={location.pathname}
				agentView={agentView}
				inboxAddresses={inboxAddresses}
				organizations={organizations}
			/>
			<SidebarInset className="h-[calc(100svh-3.5rem)] min-h-0 overflow-hidden">
				{children}
			</SidebarInset>
		</SidebarProvider>
	);
}

function AppHeader({
	pathname,
	agentView,
	inboxAddresses,
	organizations,
}: {
	pathname: string;
	agentView: AgentView;
	inboxAddresses: string[];
	organizations: AvailableOrganization[];
}) {
	const { state } = useSidebar();
	const activeArea = isAgentsPath(pathname) ? "agents" : "work";

	return (
		<header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center border-b bg-background">
			<div
				className={cn(
					"flex h-full w-20 shrink-0 items-center gap-1 pr-0 pl-2 transition-[width,padding] duration-200",
					state === "expanded" && "md:w-(--sidebar-width) md:px-4",
				)}
			>
				<Link
					to="/"
					search={{}}
					aria-label="Merimoar"
					className="flex size-8 shrink-0 items-center justify-center text-foreground"
				>
					<MerimoarLogo className="size-4" />
				</Link>
				{state === "expanded" && (
					<div className="hidden min-w-0 flex-1 md:block">
						<OrganizationSwitcher organizations={organizations} />
					</div>
				)}
				<SidebarTrigger className="ml-auto shrink-0" />
			</div>
			<div
				className={cn(
					"flex min-w-0 flex-1 items-center gap-4 pr-4 pl-2 md:grid md:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)_minmax(0,1fr)]",
					state === "expanded" && "md:pl-0",
				)}
			>
				<div className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-2">
					<p className="text-sm font-medium">
						{getPageTitle(pathname, agentView)}
					</p>
					{pathname === "/email" && (
						<InboxAddressSummary addresses={inboxAddresses} />
					)}
				</div>
				<GlobalSearch />
				<AreaTabs activeArea={activeArea} />
			</div>
		</header>
	);
}

function AreaTabs({ activeArea }: { activeArea: "work" | "agents" }) {
	const { agentRuntimeAvailable } = authenticatedRoute.useLoaderData();
	const navigate = useNavigate();
	const [selectedArea, setSelectedArea] = useState(activeArea);

	useEffect(() => {
		setSelectedArea(activeArea);
	}, [activeArea]);

	return (
		<Tabs
			value={selectedArea}
			onValueChange={(value) => {
				if (value === "work") {
					setSelectedArea(value);
					void navigate({ to: "/", search: {} }).catch(() => {
						setSelectedArea(activeArea);
					});
					return;
				}

				if (value === "agents") {
					setSelectedArea(value);
					void navigate({ to: "/agents", search: {} }).catch(() => {
						setSelectedArea(activeArea);
					});
				}
			}}
			className="ml-auto shrink-0"
		>
			<TabsList aria-label="Workspace">
				<TabsTrigger value="work">
					<IconBriefcase2 data-icon="inline-start" />
					Work
				</TabsTrigger>
				<TabsTrigger value="agents">
					<IconArtboard data-icon="inline-start" />
					Agent
					{!agentRuntimeAvailable && (
						<span
							className="size-1.5 shrink-0 rounded-full bg-destructive"
							aria-label="Agent unavailable"
						/>
					)}
				</TabsTrigger>
			</TabsList>
		</Tabs>
	);
}

function InboxAddressSummary({ addresses }: { addresses: string[] }) {
	const firstAddress = addresses[0];
	if (!firstAddress) {
		return null;
	}

	if (addresses.length === 1) {
		return (
			<p className="truncate text-xs text-muted-foreground">{firstAddress}</p>
		);
	}

	const summary = `${firstAddress} and ${addresses.length - 1} more`;

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<button
						type="button"
						className="max-w-full truncate text-left text-xs text-muted-foreground"
						aria-label={`Email inboxes: ${addresses.join(", ")}`}
					/>
				}
			>
				{summary}
			</TooltipTrigger>
			<TooltipContent
				side="bottom"
				align="start"
				className="flex-col items-start"
			>
				{addresses.map((address) => (
					<span key={address}>{address}</span>
				))}
			</TooltipContent>
		</Tooltip>
	);
}
