import { useRouterState } from "@tanstack/react-router";
import { AppSidebar } from "#/components/app-sidebar.tsx";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "#/components/ui/sidebar.tsx";

function getPageTitle(pathname: string) {
	if (pathname === "/settings/organization/email") {
		return "Email settings";
	}
	return "Email";
}

export function AppShell({ children }: { children: React.ReactNode }) {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="h-svh min-h-0 overflow-hidden">
				<header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
					<SidebarTrigger />
					<div className="h-4 w-px bg-border" />
					<p className="text-sm font-medium">{getPageTitle(pathname)}</p>
				</header>
				<div className="min-h-0 flex-1">{children}</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
