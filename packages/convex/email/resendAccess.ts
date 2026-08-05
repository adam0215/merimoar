"use node";

import type { DataIntegrationAccessTokenResponse } from "@workos-inc/node";
import type { EmailIntegrationAccessContext } from "#/integrations/model";
import { createWorkOSClient } from "#/integrations/workosAccess";

const RESEND_REQUIRED_SCOPE = "full_access";

export type ResendAccess =
	| {
			active: true;
			token: string;
			grantedScopes: string[];
	  }
	| {
			active: false;
			error:
				| "needs_reauthorization"
				| "not_installed"
				| "missing_required_scope";
	  };

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
		grantedScopes: response.accessToken.scopes,
	};
}

export async function fetchResendAccess(
	context: Pick<
		EmailIntegrationAccessContext,
		"providerSlug" | "workosOrganizationId" | "workosUserId"
	>,
): Promise<ResendAccess> {
	const response = await createWorkOSClient().pipes.getAccessToken({
		provider: context.providerSlug,
		organizationId: context.workosOrganizationId,
		userId: context.workosUserId,
	});
	return resolveResendAccess(response);
}
