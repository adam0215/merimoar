import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getAuth } from "@workos/authkit-tanstack-react-start";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { CustomToolNamesProvider } from "#/components/agents/custom-tool-names.tsx";
import { AppShell } from "#/components/app-shell";
import { AppSplashScreen } from "#/components/app-splash-screen";
import { TooltipProvider } from "#/components/ui/tooltip";
import { loadAvailableOrganizations } from "#/integrations/workos/organization-functions.ts";
import WorkspaceAccessGate from "#/integrations/workos/workspace-access-gate";
import { isAgentRuntimeAvailable } from "../../server/agent/runtime-state.ts";

const loadAgentRuntimeAvailability = createServerFn({
	method: "GET",
}).handler(isAgentRuntimeAvailable);

export const Route = createFileRoute("/_authenticated")({
	loader: async ({ location }) => {
		const auth = await getAuth();
		if (!auth.user) {
			throw redirect({
				href: `/api/auth/sign-in?returnPathname=${encodeURIComponent(location.href)}`,
			});
		}
		const [availableOrganizations, agentRuntimeAvailable] = await Promise.all([
			loadAvailableOrganizations(),
			loadAgentRuntimeAvailability(),
		]);
		return { ...auth, agentRuntimeAvailable, availableOrganizations };
	},
	component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
	const { availableOrganizations } = Route.useLoaderData();

	return (
		<>
			<Authenticated>
				<WorkspaceAccessGate>
					<CustomToolNamesProvider>
						<TooltipProvider>
							<AppShell organizations={availableOrganizations}>
								<Outlet />
							</AppShell>
						</TooltipProvider>
					</CustomToolNamesProvider>
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
