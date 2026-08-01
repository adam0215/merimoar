import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		{
			name: "markdown-as-text",
			enforce: "pre",
			transform(source, id) {
				return id.endsWith(".md")
					? `export default ${JSON.stringify(source)};`
					: null;
			},
		},
	],
	resolve: { tsconfigPaths: true },
	test: {
		environment: "edge-runtime",
		include: [
			"packages/agent/**/*.test.ts",
			"packages/convex/**/*.test.ts",
			"packages/web/src/**/*.test.ts",
		],
		env: {
			AGENT_RUNTIME_SECRET: "test_agent_runtime_secret_at_least_32_characters",
			WORKOS_API_KEY: "sk_test",
			WORKOS_CLIENT_ID: "client_test",
			WORKOS_WEBHOOK_SECRET: "whsec_test",
		},
	},
});
