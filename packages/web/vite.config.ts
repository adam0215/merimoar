import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const config = defineConfig({
	envDir: "../..",
	resolve: { tsconfigPaths: true },
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
		devtools(),
		nitro({
			plugins: ["./server/plugins/agent-subscriber.ts"],
			rollupConfig: { external: [/^@sentry\//] },
		}),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
		babel({ presets: [reactCompilerPreset()] }),
	],
});

export default config;
