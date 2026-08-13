import { describe, expect, it } from "vitest";
import { verifyResendWebhook } from "./webhookVerification";

function encodeBase64(bytes: Uint8Array) {
	return btoa(String.fromCharCode(...bytes));
}

async function signWebhook(
	secret: Uint8Array,
	id: string,
	timestamp: string,
	payload: string,
) {
	const keyData = new Uint8Array(secret).buffer;
	const key = await crypto.subtle.importKey(
		"raw",
		keyData,
		{ hash: "SHA-256", name: "HMAC" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(`${id}.${timestamp}.${payload}`),
	);
	return `v1,${encodeBase64(new Uint8Array(signature))}`;
}

describe("Resend webhook verification", () => {
	it("verifies a signed payload without a Resend API key", async () => {
		const secret = new TextEncoder().encode("webhook signing secret");
		const id = "msg_test";
		const timestamp = String(Math.floor(Date.now() / 1_000));
		const payload = JSON.stringify({ type: "email.received" });
		const signature = await signWebhook(secret, id, timestamp, payload);

		expect(
			verifyResendWebhook({
				payload,
				headers: { id, signature, timestamp },
				webhookSecret: `whsec_${encodeBase64(secret)}`,
			}),
		).toEqual({ type: "email.received" });
	});
});
