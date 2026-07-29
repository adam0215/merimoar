import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: { tsconfigPaths: true },
	test: {
		environment: "edge-runtime",
		include: [
			"packages/convex/**/*.test.ts",
			"packages/web/src/**/*.test.ts",
		],
		env: {
			WORKOS_API_KEY: "sk_test",
			WORKOS_CLIENT_ID: "client_test",
			WORKOS_WEBHOOK_SECRET: "whsec_test",
		},
	},
});
