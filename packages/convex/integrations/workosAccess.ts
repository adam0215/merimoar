"use node";

import { WorkOS } from "@workos-inc/node";
import { env } from "../_generated/server";

export function createWorkOSClient() {
	return new WorkOS(env.WORKOS_API_KEY, {
		apiHostname: env.WORKOS_API_HOSTNAME,
		clientId: env.WORKOS_CLIENT_ID,
	});
}
