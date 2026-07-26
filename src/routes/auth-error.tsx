import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/auth-error")({
	component: AuthErrorPage,
});

function AuthErrorPage() {
	return (
		<main className="flex min-h-svh items-center justify-center bg-background px-6">
			<div className="max-w-md space-y-3 text-center">
				<h1 className="text-lg font-semibold text-foreground">
					Sign-in could not be completed
				</h1>
				<p className="text-sm text-muted-foreground">
					The login request may have expired. Start a new WorkOS sign-in flow
					and try again.
				</p>
				<a
					href="/api/auth/sign-in"
					className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
				>
					Try again
				</a>
			</div>
		</main>
	);
}
