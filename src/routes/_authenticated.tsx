import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getAuth } from "@workos/authkit-tanstack-react-start";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { AppShell } from "../components/app-shell";
import { AppSplashScreen } from "../components/app-splash-screen";
import { TooltipProvider } from "../components/ui/tooltip";
import WorkspaceAccessGate from "../integrations/workos/workspace-access-gate";

export const Route = createFileRoute("/_authenticated")({
	loader: async ({ location }) => {
		const auth = await getAuth();
		if (!auth.user) {
			throw redirect({
				href: `/api/auth/sign-in?returnPathname=${encodeURIComponent(location.href)}`,
			});
		}
		return auth;
	},
	component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
	return (
		<>
			<Authenticated>
				<WorkspaceAccessGate>
					<TooltipProvider>
						<AppShell>
							<Outlet />
						</AppShell>
					</TooltipProvider>
				</WorkspaceAccessGate>
			</Authenticated>
			<AuthLoading>
				<AppSplashScreen />
			</AuthLoading>
			<Unauthenticated>
				<AuthStateMessage>
					<a
						href="/api/auth/sign-in"
						className="font-medium text-foreground underline underline-offset-4"
					>
						Sign in to continue
					</a>
				</AuthStateMessage>
			</Unauthenticated>
		</>
	);
}

function AuthStateMessage({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex min-h-svh items-center justify-center bg-background px-6 text-sm text-muted-foreground">
			{children}
		</div>
	);
}
