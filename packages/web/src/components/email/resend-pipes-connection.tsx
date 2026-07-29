import { IconLoader2 } from "@tabler/icons-react";
import { useState } from "react";
import { ProviderMark } from "#/components/email/provider-mark.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	Card,
	CardAction,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card.tsx";
import type { ResendPipesConnectionState } from "#/integrations/workos/resend-pipes.ts";
import { createResendPipesAuthorization } from "#/integrations/workos/resend-pipes-functions.ts";
import { showAppNotification } from "#/lib/app-notifications.ts";

const CONNECTION_COPY: Record<
	ResendPipesConnectionState,
	{ action?: string; badge: string; description: string }
> = {
	connected: {
		badge: "Connected",
		description: "Routes received email to matching organization inboxes.",
	},
	needs_reauthorization: {
		action: "Reconnect",
		badge: "Reconnect",
		description: "Reconnect Resend to restore email access.",
	},
	not_connected: {
		action: "Connect",
		badge: "Not connected",
		description: "Connect a Resend team to receive email.",
	},
	unavailable: {
		badge: "Unavailable",
		description: "The Resend connection could not be loaded.",
	},
};

export function ResendPipesConnection({
	connectionState,
}: {
	connectionState: ResendPipesConnectionState;
}) {
	const [isConnecting, setIsConnecting] = useState(false);
	const copy = CONNECTION_COPY[connectionState];

	async function connectResend() {
		setIsConnecting(true);
		try {
			const { url } = await createResendPipesAuthorization();
			window.location.assign(url);
		} catch (error) {
			showAppNotification({
				title: "Resend could not be connected",
				description:
					error instanceof Error ? error.message : "Try again in a moment.",
			});
			setIsConnecting(false);
		}
	}

	return (
		<Card>
			<CardHeader className="grid-cols-[minmax(0,1fr)_auto] items-center">
				<div className="flex min-w-0 items-center gap-4">
					<div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted">
						<ProviderMark provider="resend" />
					</div>
					<div className="min-w-0">
						<CardTitle>Resend</CardTitle>
						<CardDescription className="mt-1">
							{copy.description}
						</CardDescription>
					</div>
				</div>
				<CardAction className="flex items-center gap-2">
					<Badge
						variant="outline"
						className={
							connectionState === "connected"
								? "border-accent bg-accent/10 text-accent"
								: undefined
						}
					>
						{copy.badge}
					</Badge>
					{copy.action && (
						<Button
							type="button"
							variant="secondary"
							disabled={isConnecting}
							onClick={connectResend}
						>
							{isConnecting && <IconLoader2 className="animate-spin" />}
							{copy.action}
						</Button>
					)}
				</CardAction>
			</CardHeader>
		</Card>
	);
}
