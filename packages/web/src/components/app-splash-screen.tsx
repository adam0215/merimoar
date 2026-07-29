import { MerimoarLogo } from "#/components/merimoar-logo.tsx";
import { cn } from "#/lib/utils.ts";

export function AppSplashScreen({ className }: { className?: string }) {
	return (
		<main
			aria-label="Loading Merimoar"
			aria-busy="true"
			className={cn(
				"flex min-h-svh items-center justify-center bg-background",
				className,
			)}
		>
			<div className="app-splash-logo" aria-hidden="true">
				<MerimoarLogo className="size-full text-muted-foreground/50" />
				<MerimoarLogo className="app-splash-logo-shimmer size-full text-background" />
			</div>
		</main>
	);
}
