import { Resend } from "resend";

// Resend requires an API key when constructing the client even though webhook
// verification is entirely local and only uses the webhook signing secret.
const resendWebhookVerifier = new Resend("re_webhook_verification_only");

export function verifyResendWebhook(
	options: Parameters<Resend["webhooks"]["verify"]>[0],
) {
	return resendWebhookVerifier.webhooks.verify(options);
}
