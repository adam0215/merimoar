import { createHmac, timingSafeEqual } from "node:crypto";
import * as validation from "valibot";

const proofPayloadSchema = validation.strictObject({
	version: validation.literal(1),
	organizationId: validation.string(),
	principalId: validation.string(),
	configurationHash: validation.string(),
	testInputHash: validation.string(),
});

type CustomToolTestProofPayload = validation.InferOutput<
	typeof proofPayloadSchema
>;

export type CustomToolTestProofBinding = Omit<
	CustomToolTestProofPayload,
	"version"
>;

function encode(value: string | Buffer) {
	return Buffer.from(value).toString("base64url");
}

function sign(encodedPayload: string, secret: string) {
	return createHmac("sha256", secret)
		.update("custom-tool-test-proof:v1:")
		.update(encodedPayload)
		.digest();
}

function invalidProof(): never {
	throw new Error("Custom tool test proof is invalid.");
}

export function createCustomToolTestProof(
	payload: CustomToolTestProofBinding,
	secret: string,
) {
	const encodedPayload = encode(JSON.stringify({ version: 1, ...payload }));
	return `${encodedPayload}.${encode(sign(encodedPayload, secret))}`;
}

function parsePayload(encodedPayload: string) {
	let value: unknown;
	try {
		value = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
	} catch {
		invalidProof();
	}
	const parsed = validation.safeParse(proofPayloadSchema, value);
	if (!parsed.success) invalidProof();
	return parsed.output;
}

export function verifyCustomToolTestProof(
	proof: string,
	expected: CustomToolTestProofBinding,
	secret: string,
) {
	const [encodedPayload, encodedSignature, extra] = proof.split(".");
	const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
	if (
		!encodedPayload ||
		!encodedSignature ||
		extra ||
		!base64UrlPattern.test(encodedPayload) ||
		!base64UrlPattern.test(encodedSignature)
	) {
		invalidProof();
	}
	const expectedSignature = sign(encodedPayload, secret);
	let providedSignature: Buffer;
	try {
		providedSignature = Buffer.from(encodedSignature, "base64url");
	} catch {
		invalidProof();
	}
	if (
		encode(providedSignature) !== encodedSignature ||
		providedSignature.byteLength !== expectedSignature.byteLength ||
		!timingSafeEqual(providedSignature, expectedSignature)
	) {
		invalidProof();
	}
	const payload = parsePayload(encodedPayload);
	if (
		payload.organizationId !== expected.organizationId ||
		payload.principalId !== expected.principalId ||
		payload.configurationHash !== expected.configurationHash ||
		payload.testInputHash !== expected.testInputHash
	) {
		throw new Error("Custom tool test proof does not match this configuration.");
	}
	return payload;
}

export async function hashCustomToolTestInput(
	parameters: readonly { name: string }[],
	input: Readonly<Record<string, string | number | boolean>>,
) {
	const canonicalInput: [string, string | number | boolean][] = [];
	for (const parameter of parameters) {
		if (!Object.hasOwn(input, parameter.name)) continue;
		const value = input[parameter.name];
		if (value !== undefined) canonicalInput.push([parameter.name, value]);
	}
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(JSON.stringify(Object.fromEntries(canonicalInput))),
	);
	return Buffer.from(digest).toString("hex");
}
