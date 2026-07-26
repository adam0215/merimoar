import { getAuth } from "@workos/authkit-tanstack-react-start";
import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL;
if (!CONVEX_URL) {
	throw new Error("Missing VITE_CONVEX_URL");
}

export async function createAuthenticatedConvexHttpClient() {
	const auth = await getAuth();
	if (!auth.user) {
		throw new Error("Authentication required");
	}

	const client = new ConvexHttpClient(CONVEX_URL);
	client.setAuth(auth.accessToken);
	return client;
}
