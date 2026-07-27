export type AppNotification = {
	title: string;
	description?: string;
};

export const APP_NOTIFICATION_EVENT = "merimoar:app-notification";

export function showAppNotification(notification: AppNotification) {
	window.dispatchEvent(
		new CustomEvent<AppNotification>(APP_NOTIFICATION_EVENT, {
			detail: notification,
		}),
	);
}
