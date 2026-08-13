import { NotFoundException } from "@workos-inc/node";
import { createFunctionHandle, httpRouter } from "convex/server";
import { type EmailReceivedEvent, type EmailSentEvent } from "resend";
import { readResendInternetMessageId } from "#/email/outboundModel";
import { verifyResendWebhook } from "#/email/webhookVerification";
import { getResendPipesProviderSlug } from "#/integrations/resendProvider";
import {
	AUTHKIT_ADDITIONAL_EVENT_TYPES,
	authKit,
	isPipesConnectedAccountEvent,
} from "#/workos";
import { components, internal } from "./_generated/api";
import { env, httpAction } from "./_generated/server";

const http = httpRouter();

type VerifiedWorkosWebhookEvent = {
	context?: Record<string, unknown>;
	createdAt: string;
	data: Record<string, unknown>;
	event: string;
	id: string;
};

async function getResendDataIntegrationId() {
	try {
		const integration = await authKit.workos.pipes.getDataIntegration({
			slug: getResendPipesProviderSlug(),
		});
		return integration.id;
	} catch (error) {
		if (error instanceof NotFoundException) {
			return undefined;
		}
		throw error;
	}
}

http.route({
	path: "/workos/webhook",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const signature = request.headers.get("workos-signature");
		if (!signature) {
			return new Response("Missing webhook signature", { status: 400 });
		}

		const rawPayload = await request.text();
		let event: VerifiedWorkosWebhookEvent;
		try {
			event = (await authKit.workos.webhooks.constructEvent({
				payload: rawPayload,
				sigHeader: signature,
				secret: env.WORKOS_WEBHOOK_SECRET,
			})) as unknown as VerifiedWorkosWebhookEvent;
		} catch {
			return new Response("Invalid webhook signature", { status: 400 });
		}

		if (isPipesConnectedAccountEvent(event.event)) {
			const resendDataIntegrationId = await getResendDataIntegrationId();
			await ctx.runMutation(
				internal.workos.processConnectedAccountWebhookEvent,
				{
					eventId: event.id,
					event: event.event,
					data: event.data,
					resendDataIntegrationId,
				},
			);
			return new Response("OK", { status: 200 });
		}

		await ctx.runMutation(components.workOSAuthKit.lib.onWebhookEvent, {
			apiKey: env.WORKOS_API_KEY,
			event,
			eventTypes: [...AUTHKIT_ADDITIONAL_EVENT_TYPES],
			onEventHandle: await createFunctionHandle(internal.workos.authKitEvent),
		});
		return new Response("OK", { status: 200 });
	}),
});

http.route({
	pathPrefix: "/webhooks/email/resend/",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const path = new URL(request.url).pathname;
		const integrationId = path.slice("/webhooks/email/resend/".length);
		if (!integrationId || integrationId.includes("/")) {
			return new Response("Email integration not found", { status: 404 });
		}
		const verification = await ctx.runQuery(
			internal.email.integrations.getWebhookVerificationContext,
			{ integrationId },
		);
		if (!verification) {
			return new Response("Email integration not found", { status: 404 });
		}

		const externalEventId = request.headers.get("svix-id");
		const timestamp = request.headers.get("svix-timestamp");
		const signature = request.headers.get("svix-signature");
		if (!externalEventId || !timestamp || !signature) {
			return new Response("Missing webhook signature", { status: 400 });
		}

		const rawPayload = await request.text();
		let event: ReturnType<typeof verifyResendWebhook>;
		try {
			event = verifyResendWebhook({
				payload: rawPayload,
				headers: {
					id: externalEventId,
					timestamp,
					signature,
				},
				webhookSecret: verification.webhookSecret,
			});
		} catch (error) {
			console.error("Resend webhook verification failed", {
				error: error instanceof Error ? error.message : String(error),
				externalEventId,
				integrationId,
				timestamp,
			});
			return new Response("Invalid webhook signature", { status: 400 });
		}

		if (event.type === "email.received") {
			if (!verification.acceptsEmail) {
				return Response.json({ status: "ignored" });
			}
			const receivedEvent: EmailReceivedEvent = event;
			const result = await ctx.runMutation(
				internal.email.ingest.routeResendEvent,
				{
					integrationId: verification.integrationId,
					externalEventId,
					externalMessageId: receivedEvent.data.email_id,
					eventType: receivedEvent.type,
					receivedForAddresses: receivedEvent.data.received_for,
					toAddresses: receivedEvent.data.to,
					rawPayload,
					receivedAt: Date.now(),
				},
			);
			return Response.json(result, { status: 202 });
		}
		if (event.type === "email.sent") {
			const sentEvent: EmailSentEvent = event;
			const messageId = sentEvent.data.tags?.merimoar_message_id;
			if (!messageId) {
				return Response.json({ status: "ignored" });
			}
			const result = await ctx.runMutation(
				internal.email.outbound.acceptResendSentWebhook,
				{
					integrationId: verification.integrationId,
					messageId,
					externalMessageId: sentEvent.data.email_id,
					internetMessageId: readResendInternetMessageId(sentEvent.data),
					acceptedAt: Date.parse(sentEvent.data.created_at) || Date.now(),
				},
			);
			if (result.status === "accepted" && result.needsMetadata) {
				await ctx.scheduler.runAfter(
					0,
					internal.email.outboundWorker.reconcileProviderMetadata,
					{
						messageId: result.messageId,
						externalMessageId: sentEvent.data.email_id,
						integrationId: verification.integrationId,
					},
				);
			}
			return Response.json(result, { status: 202 });
		}
		return Response.json({ status: "ignored" });
	}),
});

export default http;
