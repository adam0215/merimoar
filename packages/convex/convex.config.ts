import actionCache from "@convex-dev/action-cache/convex.config";
import migrations from "@convex-dev/migrations/convex.config";
import workOSAuthKit from "@convex-dev/workos-authkit/convex.config";
import workpool from "@convex-dev/workpool/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
	env: {
		AGENT_RUNTIME_SECRET: v.optional(v.string()),
		AGENT_RUN_PUSH_SIGNING_SECRET: v.string(),
		AGENT_RUN_PUSH_URL: v.string(),
		GEMINI_API_KEY: v.string(),
		WORKOS_API_HOSTNAME: v.optional(v.string()),
		WORKOS_API_KEY: v.string(),
		WORKOS_CLIENT_ID: v.string(),
		WORKOS_RESEND_PROVIDER_SLUG: v.optional(v.string()),
		WORKOS_WEBHOOK_SECRET: v.string(),
	},
});

app.use(workOSAuthKit);
app.use(migrations);
app.use(actionCache);
app.use(workpool, { name: "emailIngestWorkpool" });
app.use(workpool, { name: "emailOutboundWorkpool" });

export default app;
