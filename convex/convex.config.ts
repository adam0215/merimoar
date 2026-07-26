import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
	env: {
		RESEND_API_KEY: v.optional(v.string()),
		RESEND_WEBHOOK_SECRET: v.optional(v.string()),
	},
});

export default app;
