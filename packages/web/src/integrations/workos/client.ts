import { WorkOS } from "@workos-inc/node";

export function createWorkOSClient() {
	const apiKey = process.env.WORKOS_API_KEY;
	if (!apiKey) {
		throw new Error("Missing WORKOS_API_KEY");
	}
	return new WorkOS(apiKey, {
		apiHostname: process.env.WORKOS_API_HOSTNAME,
		clientId: process.env.WORKOS_CLIENT_ID,
	});
}
