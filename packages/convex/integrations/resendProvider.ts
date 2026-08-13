import { env } from "../_generated/server";

export const DEFAULT_RESEND_PIPES_PROVIDER = "resend";

export function resolveResendPipesProviderSlug(
	configuredSlug: string | undefined,
) {
	return configuredSlug ?? DEFAULT_RESEND_PIPES_PROVIDER;
}

export function getResendPipesProviderSlug() {
	return resolveResendPipesProviderSlug(env.WORKOS_RESEND_PROVIDER_SLUG);
}
