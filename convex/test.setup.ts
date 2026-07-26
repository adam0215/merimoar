/// <reference types="vite/client" />

import workOSAuthKitTest from "@convex-dev/workos-authkit/test";
import { convexTest } from "convex-test";
import { components } from "./_generated/api";
import schema from "./schema";

export const modules = import.meta.glob([
	"./**/*.ts",
	"./_generated/*.js",
	"!./**/*.test.ts",
	"!./test.setup.ts",
]);

export function createTest() {
	const test = convexTest(schema, modules);
	workOSAuthKitTest.register(test);
	return test;
}

export async function syncWorkosUser(
	test: ReturnType<typeof createTest>,
	{
		id,
		name,
		email,
	}: {
		id: string;
		name: string;
		email: string;
	},
) {
	await test.mutation(components.workOSAuthKit.lib.onWebhookEvent, {
		apiKey: "sk_test",
		event: {
			id: `event_${id}`,
			createdAt: "2026-01-01T00:00:00.000Z",
			event: "user.created",
			data: {
				id,
				email,
				name,
				emailVerified: true,
				metadata: {},
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
				object: "user",
			},
		},
	});
}
