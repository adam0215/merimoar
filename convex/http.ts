import { httpRouter } from "convex/server";
import { type EmailReceivedEvent, Resend } from "resend";
import { internal } from "./_generated/api";
import { env, httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
	path: "/webhooks/resend",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		if (!env.RESEND_WEBHOOK_SECRET) {
			return new Response("Webhook is not configured", { status: 503 });
		}

		const externalEventId = request.headers.get("svix-id");
		const timestamp = request.headers.get("svix-timestamp");
		const signature = request.headers.get("svix-signature");
		if (!externalEventId || !timestamp || !signature) {
			return new Response("Missing webhook signature", { status: 400 });
		}

		const rawPayload = await request.text();
		let event: ReturnType<Resend["webhooks"]["verify"]>;
		try {
			event = new Resend().webhooks.verify({
				payload: rawPayload,
				headers: {
					id: externalEventId,
					timestamp,
					signature,
				},
				webhookSecret: env.RESEND_WEBHOOK_SECRET,
			});
		} catch {
			return new Response("Invalid webhook signature", { status: 400 });
		}

		if (event.type !== "email.received") {
			return Response.json({ status: "ignored" });
		}

		const receivedEvent: EmailReceivedEvent = event;
		const result = await ctx.runMutation(
			internal.email.ingest.recordResendEvent,
			{
				externalEventId,
				externalMessageId: receivedEvent.data.email_id,
				eventType: receivedEvent.type,
				recipientAddresses: [
					...receivedEvent.data.to,
					...receivedEvent.data.received_for,
				],
				rawPayload,
				receivedAt: Date.now(),
			},
		);
		return Response.json(result, { status: 202 });
	}),
});

export default http;
