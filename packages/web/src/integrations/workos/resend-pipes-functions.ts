import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { getAuth } from "@workos/authkit-tanstack-react-start";
import { WorkOS } from "@workos-inc/node";
import {
	createEmailSettingsReturnTo,
	isResendAuthorizationRejected,
	RESEND_PIPES_PROVIDER,
	type ResendPipesConnectionState,
	resolveResendPipesConnectionState,
} from "#/integrations/workos/resend-pipes";

const RESEND_DOMAINS_URL = "https://api.resend.com/domains";
const RESEND_HEALTH_CHECK_TIMEOUT_MS = 5_000;

function createWorkOSClient() {
	const apiKey = process.env.WORKOS_API_KEY;
	if (!apiKey) {
		throw new Error("Missing WORKOS_API_KEY");
	}
	return new WorkOS(apiKey, {
		apiHostname: process.env.WORKOS_API_HOSTNAME,
		clientId: process.env.WORKOS_CLIENT_ID,
	});
}

async function getPipesSubject() {
	const auth = await getAuth();
	if (!auth.user || !auth.organizationId) {
		throw new Error("An active organization is required.");
	}
	return {
		organizationId: auth.organizationId,
		userId: auth.user.id,
	};
}

async function validateConnectedResendAccount(
	workos: WorkOS,
	subject: Awaited<ReturnType<typeof getPipesSubject>>,
): Promise<ResendPipesConnectionState> {
	const access = await workos.pipes.getAccessToken({
		...subject,
		provider: RESEND_PIPES_PROVIDER,
	});
	if (!access.active) {
		return access.error === "needs_reauthorization"
			? "needs_reauthorization"
			: "not_connected";
	}

	let response: Response;
	try {
		response = await fetch(RESEND_DOMAINS_URL, {
			headers: {
				Authorization: `Bearer ${access.accessToken.accessToken}`,
			},
			signal: AbortSignal.timeout(RESEND_HEALTH_CHECK_TIMEOUT_MS),
		});
	} catch (error) {
		console.error("Could not verify the Resend OAuth grant.", error);
		return "connected";
	}
	if (!isResendAuthorizationRejected(response.status)) {
		return "connected";
	}

	try {
		await workos.pipes.updateUserConnectedAccount({
			...subject,
			slug: RESEND_PIPES_PROVIDER,
			state: "needs_reauthorization",
		});
	} catch (error) {
		console.error(
			"Could not persist the revoked Resend connection state.",
			error,
		);
	}
	return "needs_reauthorization";
}

export const refreshResendPipesConnectionState = createServerFn({
	method: "POST",
}).handler(async (): Promise<ResendPipesConnectionState> => {
	try {
		const subject = await getPipesSubject();
		const workos = createWorkOSClient();
		const providers = await workos.pipes.listUserDataProviders(subject);
		const connectionState = resolveResendPipesConnectionState(providers.data);
		if (connectionState !== "connected") {
			return connectionState;
		}
		return await validateConnectedResendAccount(workos, subject);
	} catch (error) {
		console.error("Could not load the Resend Pipes connection.", error);
		return "unavailable";
	}
});

export const createResendPipesAuthorization = createServerFn({
	method: "POST",
}).handler(async () => {
	const subject = await getPipesSubject();
	const returnTo = createEmailSettingsReturnTo(getRequestUrl());
	return await createWorkOSClient().pipes.authorizeDataIntegration({
		...subject,
		slug: RESEND_PIPES_PROVIDER,
		returnTo,
	});
});
