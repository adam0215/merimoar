import actionCache from "@convex-dev/action-cache/convex.config";
import migrations from "@convex-dev/migrations/convex.config";
import workOSAuthKit from "@convex-dev/workos-authkit/convex.config";
import workpool from "@convex-dev/workpool/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
	env: {
		GEMINI_API_KEY: v.string(),
		WORKOS_API_HOSTNAME: v.optional(v.string()),
		WORKOS_API_KEY: v.string(),
		WORKOS_CLIENT_ID: v.string(),
		WORKOS_WEBHOOK_SECRET: v.string(),
	},
});

app.use(workOSAuthKit);
app.use(migrations);
app.use(actionCache);
app.use(workpool, { name: "emailIngestWorkpool" });
app.use(workpool, { name: "emailOutboundWorkpool" });

export default app;
