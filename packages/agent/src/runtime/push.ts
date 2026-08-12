import * as v from "valibot";
import type { ClaimedRun } from "../types";
import { getDiagnosticErrorMessage } from "./diagnostics";

export const AGENT_RUN_PUSH_SIGNATURE_HEADER = "x-merimoar-signature";

const PUSH_PROTOCOL_VERSION = 1;
const DEFAULT_MAXIMUM_AGE_MS = 5 * 60_000;
const MAXIMUM_BODY_BYTES = 4_096;
const MAXIMUM_IDENTIFIER_LENGTH = 500;

const pushIdentifierSchema = v.pipe(
	v.string(),
	v.minLength(1),
	v.maxLength(MAXIMUM_IDENTIFIER_LENGTH),
);

const agentRunPushPayloadSchema = v.strictObject({
	version: v.literal(PUSH_PROTOCOL_VERSION),
	runId: pushIdentifierSchema,
	leaseGeneration: v.pipe(v.number(), v.integer(), v.minValue(0)),
	deliveryId: pushIdentifierSchema,
	sentAt: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

export type AgentRunPushPayload = v.InferOutput<
	typeof agentRunPushPayloadSchema
>;

export type AgentRunPushHost = {
	claimRun(
		runId: string,
		leaseGeneration: number,
		claimToken: string,
	): Promise<ClaimedRun | null>;
	invokeRun(claim: ClaimedRun, abortSignal: AbortSignal): Promise<void>;
	onError?(error: unknown): void;
};

export function serializeAgentRunPushPayload(
	payload: Omit<AgentRunPushPayload, "version">,
) {
	return JSON.stringify({ version: PUSH_PROTOCOL_VERSION, ...payload });
}

export async function signAgentRunPushBody(body: string, secret: string) {
	const key = await importSigningKey(secret, ["sign"]);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(body),
	);
	return `v1=${encodeHex(new Uint8Array(signature))}`;
}

export async function verifyAgentRunPushBody(
	body: string,
	signature: string,
	secret: string,
) {
	const match = /^v1=([0-9a-f]{64})$/.exec(signature);
	if (!match?.[1]) return false;
	const key = await importSigningKey(secret, ["verify"]);
	return await crypto.subtle.verify(
		"HMAC",
		key,
		decodeHex(match[1]),
		new TextEncoder().encode(body),
	);
}

export function createAgentRunPushHandler(
	host: AgentRunPushHost,
	options: {
		signingSecret: string;
		deferExecution(execution: Promise<void>): void;
		maximumAgeMs?: number;
		now?: () => number;
	},
) {
	requireSigningSecret(options.signingSecret);
	const maximumAgeMs = options.maximumAgeMs ?? DEFAULT_MAXIMUM_AGE_MS;
	if (!Number.isInteger(maximumAgeMs) || maximumAgeMs < 1) {
		throw new Error("Agent run push maximum age must be a positive integer.");
	}
	const now = options.now ?? Date.now;

	return async (request: Request) => {
		if (request.method !== "POST") {
			return new Response("Method not allowed", {
				status: 405,
				headers: { Allow: "POST" },
			});
		}
		if (!request.headers.get("content-type")?.startsWith("application/json")) {
			return new Response("Unsupported media type", { status: 415 });
		}
		const signature = request.headers.get(AGENT_RUN_PUSH_SIGNATURE_HEADER);
		if (!signature) return new Response("Unauthorized", { status: 401 });

		let body: string;
		try {
			body = await readLimitedBody(request, MAXIMUM_BODY_BYTES);
		} catch (error) {
			return new Response(
				error instanceof AgentRunPushBodyTooLargeError
					? "Payload too large"
					: "Invalid request body",
				{ status: error instanceof AgentRunPushBodyTooLargeError ? 413 : 400 },
			);
		}
		if (
			!(await verifyAgentRunPushBody(body, signature, options.signingSecret))
		) {
			return new Response("Unauthorized", { status: 401 });
		}

		const payload = parseAgentRunPushPayload(body);
		if (!payload) return new Response("Invalid push payload", { status: 400 });
		if (Math.abs(now() - payload.sentAt) > maximumAgeMs) {
			return new Response("Push delivery expired", { status: 401 });
		}
		if (request.signal.aborted) {
			return new Response("Push delivery stopped", { status: 503 });
		}

		let claim: ClaimedRun | null;
		try {
			claim = await host.claimRun(
				payload.runId,
				payload.leaseGeneration,
				crypto.randomUUID(),
			);
		} catch (error) {
			reportPushError(host, error);
			return new Response("Agent run claim failed", { status: 503 });
		}
		if (!claim) return new Response(null, { status: 204 });

		let beginExecution = () => {};
		const executionAccepted = new Promise<void>((resolve) => {
			beginExecution = resolve;
		});
		const execution = executionAccepted
			.then(() => host.invokeRun(claim, new AbortController().signal))
			.catch((error) => {
				reportPushError(host, error);
			});
		try {
			options.deferExecution(execution);
		} catch (error) {
			reportPushError(host, error);
			return new Response("Agent run background execution is unavailable", {
				status: 503,
			});
		}
		beginExecution();
		return Response.json(
			{ status: "accepted", runId: claim.runId },
			{ status: 202 },
		);
	};
}

function parseAgentRunPushPayload(body: string): AgentRunPushPayload | null {
	let value: unknown;
	try {
		value = JSON.parse(body);
	} catch {
		return null;
	}
	const result = v.safeParse(agentRunPushPayloadSchema, value);
	return result.success ? result.output : null;
}

async function readLimitedBody(request: Request, maximumBytes: number) {
	const declaredLength = Number(request.headers.get("content-length"));
	if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
		throw new AgentRunPushBodyTooLargeError();
	}
	if (!request.body) return "";
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let byteLength = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		byteLength += value.byteLength;
		if (byteLength > maximumBytes) {
			await reader.cancel();
			throw new AgentRunPushBodyTooLargeError();
		}
		chunks.push(value);
	}
	const body = new Uint8Array(byteLength);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder("utf-8", { fatal: true }).decode(body);
}

class AgentRunPushBodyTooLargeError extends Error {}

function requireSigningSecret(secret: string) {
	if (secret.length < 32) {
		throw new Error(
			"Agent run push signing secret must contain 32 characters.",
		);
	}
}

async function importSigningKey(secret: string, keyUsages: KeyUsage[]) {
	requireSigningSecret(secret);
	return await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		keyUsages,
	);
}

function encodeHex(bytes: Uint8Array) {
	return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeHex(value: string) {
	return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) =>
		Number.parseInt(byte, 16),
	);
}

function reportPushError(host: AgentRunPushHost, error: unknown) {
	try {
		host.onError?.(new Error(getDiagnosticErrorMessage(error)));
	} catch {}
}
