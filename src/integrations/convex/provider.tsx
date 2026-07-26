import { ConvexQueryClient } from "@convex-dev/react-query";
import {
	useAccessToken,
	useAuth,
} from "@workos/authkit-tanstack-react-start/client";
import { ConvexProviderWithAuth } from "convex/react";
import { useCallback, useMemo } from "react";

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL;
if (!CONVEX_URL) {
	console.error("missing envar CONVEX_URL");
}
const convexQueryClient = new ConvexQueryClient(CONVEX_URL);

export default function AppConvexProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<ConvexProviderWithAuth
			client={convexQueryClient.convexClient}
			useAuth={useAuthFromWorkOS}
		>
			{children}
		</ConvexProviderWithAuth>
	);
}

function useAuthFromWorkOS() {
	const { loading, user } = useAuth();
	const { getAccessToken, refresh } = useAccessToken();
	const fetchAccessToken = useCallback(
		async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
			if (!user) {
				return null;
			}
			return forceRefreshToken
				? ((await refresh()) ?? null)
				: ((await getAccessToken()) ?? null);
		},
		[user, refresh, getAccessToken],
	);

	return useMemo(
		() => ({
			isLoading: loading,
			isAuthenticated: Boolean(user),
			fetchAccessToken,
		}),
		[loading, user, fetchAccessToken],
	);
}
