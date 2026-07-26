import workOSAuthKit from "@convex-dev/workos-authkit/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
	env: {
		RESEND_API_KEY: v.optional(v.string()),
		RESEND_WEBHOOK_SECRET: v.optional(v.string()),
		WORKOS_API_HOSTNAME: v.optional(v.string()),
		WORKOS_API_KEY: v.string(),
		WORKOS_CLIENT_ID: v.string(),
		WORKOS_WEBHOOK_SECRET: v.string(),
	},
});

app.use(workOSAuthKit);

export default app;
