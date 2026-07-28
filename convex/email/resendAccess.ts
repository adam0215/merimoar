"use node";

import {
	type DataIntegrationAccessTokenResponse,
	WorkOS,
} from "@workos-inc/node";
import { env } from "../_generated/server";

export const RESEND_PIPES_PROVIDER = "resend";
export const RESEND_REQUIRED_SCOPE = "full_access";

export type ResendAccess =
	| {
			active: true;
			token: string;
	  }
	| {
			active: false;
			error:
				| "needs_reauthorization"
				| "not_installed"
				| "missing_required_scope";
	  };

function createWorkOSClient() {
	return new WorkOS(env.WORKOS_API_KEY, {
		apiHostname: env.WORKOS_API_HOSTNAME,
		clientId: env.WORKOS_CLIENT_ID,
	});
}

export function resolveResendAccess(
	response: DataIntegrationAccessTokenResponse,
): ResendAccess {
	if (!response.active) {
		return response;
	}
	if (
		response.accessToken.missingScopes.includes(RESEND_REQUIRED_SCOPE) ||
		!response.accessToken.scopes.includes(RESEND_REQUIRED_SCOPE)
	) {
		return { active: false, error: "missing_required_scope" };
	}
	return {
		active: true,
		token: response.accessToken.accessToken,
	};
}

export async function fetchResendAccess({
	workosOrganizationId,
	workosUserId,
}: {
	workosOrganizationId?: string;
	workosUserId?: string;
}): Promise<ResendAccess> {
	if (!workosOrganizationId || !workosUserId) {
		return { active: false, error: "not_installed" };
	}
	const response = await createWorkOSClient().pipes.getAccessToken({
		provider: RESEND_PIPES_PROVIDER,
		organizationId: workosOrganizationId,
		userId: workosUserId,
	});
	return resolveResendAccess(response);
}
