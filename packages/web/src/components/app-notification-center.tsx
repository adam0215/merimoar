import { IconAlertCircle, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import {
	APP_NOTIFICATION_EVENT,
	type AppNotification,
} from "#/lib/app-notifications.ts";

const NOTIFICATION_DURATION_MS = 6000;

export function AppNotificationCenter() {
	const [notification, setNotification] = useState<AppNotification | null>(
		null,
	);

	useEffect(() => {
		function showNotification(event: Event) {
			setNotification((event as CustomEvent<AppNotification>).detail);
		}

		window.addEventListener(APP_NOTIFICATION_EVENT, showNotification);
		return () =>
			window.removeEventListener(APP_NOTIFICATION_EVENT, showNotification);
	}, []);

	useEffect(() => {
		if (!notification) {
			return;
		}

		const timeout = window.setTimeout(
			() => setNotification(null),
			NOTIFICATION_DURATION_MS,
		);
		return () => window.clearTimeout(timeout);
	}, [notification]);

	if (!notification) {
		return null;
	}

	return (
		<div className="pointer-events-none fixed inset-x-4 top-16 z-50 flex justify-center sm:inset-x-auto sm:right-4 sm:justify-end">
			<div
				role="alert"
				className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-background p-3.5 shadow-xl"
			>
				<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
					<IconAlertCircle className="size-4" />
				</span>
				<div className="min-w-0 flex-1 pt-0.5">
					<p className="text-sm font-medium">{notification.title}</p>
					{notification.description && (
						<p className="mt-0.5 text-xs leading-5 text-muted-foreground">
							{notification.description}
						</p>
					)}
				</div>
				<button
					type="button"
					onClick={() => setNotification(null)}
					className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,transform] hover:bg-muted hover:text-foreground active:scale-97"
					aria-label="Dismiss notification"
				>
					<IconX className="size-4" />
				</button>
			</div>
		</div>
	);
}
