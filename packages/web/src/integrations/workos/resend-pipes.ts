export const RESEND_PIPES_PROVIDER = "resend";
export const EMAIL_SETTINGS_PATH = "/settings/organization/email";

export type ResendPipesConnectionState =
	| "connected"
	| "needs_reauthorization"
	| "not_connected"
	| "unavailable";

type PipesProviderState = {
	slug: string;
	connectedAccount: {
		state: "connected" | "disconnected" | "needs_reauthorization";
	} | null;
};

export function resolveResendPipesConnectionState(
	providers: PipesProviderState[],
): ResendPipesConnectionState {
	const resend = providers.find(
		(provider) => provider.slug === RESEND_PIPES_PROVIDER,
	);
	if (!resend) {
		return "unavailable";
	}
	const state = resend.connectedAccount?.state;
	return state === "disconnected" || state === undefined
		? "not_connected"
		: state;
}

export function isResendAuthorizationRejected(statusCode: number) {
	return statusCode === 401 || statusCode === 403;
}

export function createEmailSettingsReturnTo(requestUrl: URL) {
	return new URL(EMAIL_SETTINGS_PATH, requestUrl.origin).toString();
}
