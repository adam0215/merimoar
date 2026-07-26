import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { AppSidebar } from "#/components/app-sidebar.tsx";
import { MerimoarLogo } from "#/components/merimoar-logo.tsx";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
	useSidebar,
} from "#/components/ui/sidebar.tsx";
import { cn } from "#/lib/utils.ts";
import { api } from "../../convex/_generated/api";

function getPageTitle(pathname: string) {
	if (pathname === "/settings/organization/entities") {
		return "Entity settings";
	}
	if (pathname === "/settings/organization/email") {
		return "Email settings";
	}
	if (pathname === "/cases") {
		return "Cases";
	}
	if (pathname === "/contacts") {
		return "Contacts";
	}
	if (pathname === "/profile") {
		return "Profile";
	}
	return "Email";
}

export function AppShell({ children }: { children: React.ReactNode }) {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const connections = useQuery(api.email.reader.listConnections, {});
	const activeConnection = connections?.find(
		(connection) => connection.status === "active",
	);

	return (
		<SidebarProvider className="app-shell-enter pt-14">
			<AppSidebar />
			<AppHeader
				pathname={pathname}
				connectionAddress={activeConnection?.address}
			/>
			<SidebarInset className="h-[calc(100svh-3.5rem)] min-h-0 overflow-hidden">
				{children}
			</SidebarInset>
		</SidebarProvider>
	);
}

function AppHeader({
	pathname,
	connectionAddress,
}: {
	pathname: string;
	connectionAddress?: string;
}) {
	const { state } = useSidebar();

	return (
		<header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center border-b bg-background">
			<div
				className={cn(
					"flex h-full w-20 shrink-0 items-center justify-between pr-0 pl-4 transition-[width] duration-200",
					state === "expanded" && "md:w-(--sidebar-width) md:px-4",
				)}
			>
				<Link
					to="/email"
					search={{}}
					aria-label="Merimoar"
					className="flex size-8 items-center justify-center text-foreground"
				>
					<MerimoarLogo className="size-4" />
				</Link>
				<SidebarTrigger />
			</div>
			<div
				className={cn(
					"flex min-w-0 flex-1 items-center pr-4 pl-2",
					state === "expanded" && "md:pl-0",
				)}
			>
				<div className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-2">
					<p className="text-sm font-medium">{getPageTitle(pathname)}</p>
					{pathname === "/email" && connectionAddress && (
						<p className="truncate text-xs text-muted-foreground">
							{connectionAddress}
						</p>
					)}
				</div>
			</div>
		</header>
	);
}
