import { useQuery } from "convex-helpers/react/cache";
import { useEffect } from "react";
import { api } from "../../../convex/_generated/api";
import { AppSplashScreen } from "../../components/app-splash-screen";

export default function WorkspaceAccessGate({
	children,
}: {
	children: React.ReactNode;
}) {
	const access = useQuery(api.auth.members.currentAccess, {});

	useEffect(() => {
		if (access === "inactive") {
			window.location.assign("/api/auth/sign-out");
		}
	}, [access]);

	if (access === "active") {
		return children;
	}
	if (access === undefined) {
		return <AppSplashScreen />;
	}
	if (access === "not_synced") {
		return <AppSplashScreen />;
	}
	if (access === "not_provisioned") {
		return (
			<WorkspaceState>
				This WorkOS organization has not been provisioned in Merimoar.
			</WorkspaceState>
		);
	}
	if (access === "inactive") {
		return <AppSplashScreen />;
	}
	if (access === "unauthenticated") {
		return (
			<WorkspaceState>
				Your WorkOS access is no longer active. <SignInAgainLink />
			</WorkspaceState>
		);
	}

	return <AppSplashScreen />;
}

function SignInAgainLink() {
	return (
		<a
			href="/api/auth/sign-out"
			className="font-medium text-foreground underline underline-offset-4"
		>
			Sign in again
		</a>
	);
}

function WorkspaceState({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex min-h-svh items-center justify-center bg-background px-6 text-sm text-muted-foreground">
			{children}
		</div>
	);
}
