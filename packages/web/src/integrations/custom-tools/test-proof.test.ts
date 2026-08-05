// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
	createCustomToolTestProof,
	hashCustomToolTestInput,
	verifyCustomToolTestProof,
} from "../../../server/custom-tools/test-proof.ts";

const secret = "test_agent_runtime_secret_at_least_32_characters";
const payload = {
	organizationId: "org_one",
	principalId: "user_one",
	configurationHash: "a".repeat(64),
	testInputHash: "b".repeat(64),
};

describe("custom tool test proof", () => {
	it("round-trips a proof without an expiry", () => {
		const proof = createCustomToolTestProof(payload, secret);
		expect(verifyCustomToolTestProof(proof, payload, secret)).toEqual({
			version: 1,
			...payload,
		});
		expect(
			Buffer.from(proof.split(".")[0]!, "base64url").toString(),
		).not.toContain("expires");
	});

	it.each([
		{ organizationId: "org_two" },
		{ principalId: "user_two" },
		{ configurationHash: "c".repeat(64) },
		{ testInputHash: "c".repeat(64) },
	])("rejects replay with another bound subject: $organizationId$principalId", (change) => {
		const proof = createCustomToolTestProof(payload, secret);
		expect(() =>
			verifyCustomToolTestProof(proof, { ...payload, ...change }, secret),
		).toThrow("does not match this configuration");
	});

	it("rejects payload and signature tampering", () => {
		const proof = createCustomToolTestProof(payload, secret);
		const [body, signature] = proof.split(".");
		expect(() =>
			verifyCustomToolTestProof(`${body}x.${signature}`, payload, secret),
		).toThrow("proof is invalid");
		expect(() =>
			verifyCustomToolTestProof(`${body}.${signature}x`, payload, secret),
		).toThrow("proof is invalid");
		expect(() =>
			verifyCustomToolTestProof(`${body}.${signature}!`, payload, secret),
		).toThrow("proof is invalid");
	});

	it("hashes test input in parameter order", async () => {
		const parameters = [{ name: "first" }, { name: "second" }];
		expect(
			await hashCustomToolTestInput(parameters, { second: 2, first: "one" }),
		).toBe(
			await hashCustomToolTestInput(parameters, { first: "one", second: 2 }),
		);
	});

	it("includes prototype-looking parameter names in the input hash", async () => {
		const parameters = [{ name: "__proto__" }];
		const first = Object.fromEntries([["__proto__", "first"]]);
		const second = Object.fromEntries([["__proto__", "second"]]);

		expect(await hashCustomToolTestInput(parameters, first)).not.toBe(
			await hashCustomToolTestInput(parameters, second),
		);
	});
});
