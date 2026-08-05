// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
	assertAllowedDestinationAddress,
	CUSTOM_TOOL_MAX_RESPONSE_BYTES,
	CustomToolExecutionError,
	invokeCustomToolRequest,
	readLimitedResponseBody,
	respondWithPinnedAddress,
	validateCustomToolInput,
} from "../../../server/custom-tools/executor.ts";

const configuration = {
	baseUrl: "https://api.example.com/base",
	path: "temperature",
	parameters: [
		{
			name: "sensor_id",
			type: "string" as const,
			description: "Sensor identifier",
			required: true,
		},
		{
			name: "include_history",
			type: "boolean" as const,
			description: "Include history",
			required: false,
		},
	],
};

const publicResolver = async () => [{ address: "8.8.8.8", family: 4 as const }];

type RequestInput = {
	endpoint: URL;
	address: { address: string; family: 4 | 6 };
	body: string;
	signal: AbortSignal;
};

function response(value: unknown, status = 200) {
	return {
		status,
		body: new TextEncoder().encode(JSON.stringify(value)),
	};
}

function requestSpy(value: unknown = { ok: true }, status = 200) {
	return vi.fn<(_input: RequestInput) => Promise<ReturnType<typeof response>>>(
		async () => response(value, status),
	);
}

describe("custom tool HTTP executor", () => {
	it("answers pinned lookup callbacks in the requested Node address shape", () => {
		const address = { address: "8.8.8.8", family: 4 as const };
		const single = vi.fn<Parameters<typeof respondWithPinnedAddress>[2]>();
		const all = vi.fn<Parameters<typeof respondWithPinnedAddress>[2]>();

		respondWithPinnedAddress(address, false, single);
		respondWithPinnedAddress(address, true, all);

		expect(single).toHaveBeenCalledWith(null, "8.8.8.8", 4);
		expect(all).toHaveBeenCalledWith(null, [address]);
	});

	it.each([
		["0.0.0.0", 4],
		["10.0.0.1", 4],
		["100.64.0.1", 4],
		["127.0.0.1", 4],
		["169.254.169.254", 4],
		["172.16.0.1", 4],
		["192.88.99.1", 4],
		["192.168.1.1", 4],
		["198.51.100.10", 4],
		["::", 6],
		["::1", 6],
		["::ffff:127.0.0.1", 6],
		["fc00::1", 6],
		["fe80::1", 6],
		["2001::1", 6],
		["2001:db8::1", 6],
		["2002::1", 6],
		["3fff::1", 6],
	])("blocks non-public production destination %s", (address, family) => {
		expect(() =>
			assertAllowedDestinationAddress(
				{ address, family: family as 4 | 6 },
				false,
			),
		).toThrow("public address");
	});

	it.each([
		["8.8.8.8", 4],
		["2606:4700:4700::1111", 6],
	])("allows public destination %s", (address, family) => {
		expect(() =>
			assertAllowedDestinationAddress(
				{ address, family: family as 4 | 6 },
				false,
			),
		).not.toThrow();
	});

	it("allows only loopback private destinations in development", () => {
		expect(() =>
			assertAllowedDestinationAddress(
				{ address: "127.99.1.2", family: 4 },
				true,
			),
		).not.toThrow();
		expect(() =>
			assertAllowedDestinationAddress({ address: "::1", family: 6 }, true),
		).not.toThrow();
		expect(() =>
			assertAllowedDestinationAddress({ address: "10.0.0.2", family: 4 }, true),
		).toThrow("public address");
	});

	it("allows HTTP loopback only in development", async () => {
		const localConfiguration = {
			...configuration,
			baseUrl: "http://localhost:8787/api",
		};
		const dependencies = {
			resolveHostname: async () => [
				{ address: "127.0.0.1", family: 4 as const },
			],
			sendRequest: async () => response({ ok: true }),
		};
		await expect(
			invokeCustomToolRequest(
				localConfiguration,
				{ sensor_id: "sensor-1" },
				{ ...dependencies, development: false },
			),
		).rejects.toMatchObject({ code: "UNSAFE_DESTINATION" });
		await expect(
			invokeCustomToolRequest(
				localConfiguration,
				{ sensor_id: "sensor-1" },
				{ ...dependencies, development: true },
			),
		).resolves.toMatchObject({ value: { ok: true } });
	});

	it("requires an explicit loopback hostname for the development exception", async () => {
		const sendRequest = requestSpy();
		await expect(
			invokeCustomToolRequest(
				{
					...configuration,
					baseUrl: "http://service.example.test/api",
				},
				{ sensor_id: "sensor-1" },
				{
					development: true,
					resolveHostname: async () => [{ address: "127.0.0.1", family: 4 }],
					sendRequest,
				},
			),
		).rejects.toMatchObject({ code: "UNSAFE_DESTINATION" });
		expect(sendRequest).not.toHaveBeenCalled();
	});

	it("rejects every DNS answer when one result is private", async () => {
		const sendRequest = requestSpy();
		await expect(
			invokeCustomToolRequest(
				configuration,
				{ sensor_id: "sensor-1" },
				{
					resolveHostname: async () => [
						{ address: "8.8.8.8", family: 4 },
						{ address: "169.254.169.254", family: 4 },
					],
					sendRequest,
				},
			),
		).rejects.toMatchObject({ code: "UNSAFE_DESTINATION" });
		expect(sendRequest).not.toHaveBeenCalled();
	});

	it.each([
		"https://127.1/api",
		"https://0177.0.0.1/api",
		"https://0x7f000001/api",
		"https://2130706433/api",
		"https://[::ffff:127.0.0.1]/api",
	])("blocks normalized loopback URL representation %s", async (baseUrl) => {
		const sendRequest = requestSpy();
		await expect(
			invokeCustomToolRequest(
				{ ...configuration, baseUrl },
				{ sensor_id: "sensor-1" },
				{ sendRequest, development: false },
			),
		).rejects.toMatchObject({ code: "UNSAFE_DESTINATION" });
		expect(sendRequest).not.toHaveBeenCalled();
	});

	it("sends exactly the validated parameter object to the pinned address", async () => {
		const sendRequest = requestSpy([1, 2, 3]);
		const result = await invokeCustomToolRequest(
			configuration,
			{ sensor_id: "sensor-1", include_history: false },
			{ resolveHostname: publicResolver, sendRequest },
		);
		expect(sendRequest).toHaveBeenCalledOnce();
		expect(sendRequest.mock.calls[0]?.[0]).toMatchObject({
			address: { address: "8.8.8.8", family: 4 },
			body: '{"sensor_id":"sensor-1","include_history":false}',
		});
		expect(result).toMatchObject({
			endpoint: "https://api.example.com/base/temperature",
			status: 200,
			value: [1, 2, 3],
		});
	});

	it("preserves arbitrary JSON property names in the request body", async () => {
		const input = JSON.parse(
			'{"":"empty","camelCase":7,"kebab-case":true," spaced key ":"space","__proto__":"safe","ümlaut":"värde"}',
		) as Record<string, unknown>;
		const parameters = (
			[
				["", "string"],
				["camelCase", "number"],
				["kebab-case", "boolean"],
				[" spaced key ", "string"],
				["__proto__", "string"],
				["ümlaut", "string"],
			] as const
		).map(([name, type]) => ({
			name,
			type,
			description: "Value",
			required: true,
		}));
		const sendRequest = requestSpy();
		await invokeCustomToolRequest({ ...configuration, parameters }, input, {
			resolveHostname: publicResolver,
			sendRequest,
		});

		const body = sendRequest.mock.calls[0]?.[0].body;
		expect(body).toBe(JSON.stringify(input));
		expect(Object.hasOwn(JSON.parse(body ?? "{}"), "__proto__")).toBe(true);
	});

	it.each([
		{ value: { ok: true }, label: "object" },
		{ value: [1, "two"], label: "array" },
		{ value: "ready", label: "string primitive" },
		{ value: 42, label: "number primitive" },
		{ value: null, label: "null primitive" },
	])("returns raw JSON $label", async ({ value }) => {
		const result = await invokeCustomToolRequest(
			configuration,
			{ sensor_id: "sensor-1" },
			{
				resolveHostname: publicResolver,
				sendRequest: async () => response(value),
			},
		);
		expect(result.value).toEqual(value);
	});

	it.each([
		201, 204, 301, 302, 307, 308, 400, 500,
	])("rejects HTTP %s without following it", async (status) => {
		const sendRequest = requestSpy({ hidden: true }, status);
		await expect(
			invokeCustomToolRequest(
				configuration,
				{ sensor_id: "sensor-1" },
				{ resolveHostname: publicResolver, sendRequest },
			),
		).rejects.toMatchObject({
			code: "UNEXPECTED_STATUS",
			message: `Custom tool returned HTTP ${status}; expected HTTP 200.`,
		});
		expect(sendRequest).toHaveBeenCalledOnce();
	});

	it("enforces the overall timeout", async () => {
		await expect(
			invokeCustomToolRequest(
				configuration,
				{ sensor_id: "sensor-1" },
				{
					resolveHostname: publicResolver,
					timeoutMs: 5,
					sendRequest: async ({ signal }) =>
						await new Promise((_, reject) => {
							signal.addEventListener(
								"abort",
								() => reject(new DOMException("Timed out", "AbortError")),
								{ once: true },
							);
						}),
				},
			),
		).rejects.toMatchObject({ code: "TIMEOUT" });
	});

	it("stops accepting streamed response bytes at 64 KiB", async () => {
		async function* chunks() {
			yield new Uint8Array(CUSTOM_TOOL_MAX_RESPONSE_BYTES);
			yield new Uint8Array([1]);
		}
		await expect(
			readLimitedResponseBody(chunks(), CUSTOM_TOOL_MAX_RESPONSE_BYTES),
		).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
	});

	it("defensively rejects oversized bodies returned by an injected transport", async () => {
		await expect(
			invokeCustomToolRequest(
				configuration,
				{ sensor_id: "sensor-1" },
				{
					resolveHostname: publicResolver,
					sendRequest: async () => ({
						status: 200,
						body: new Uint8Array(CUSTOM_TOOL_MAX_RESPONSE_BYTES + 1),
					}),
				},
			),
		).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
	});

	it("rejects invalid JSON without exposing the body", async () => {
		await expect(
			invokeCustomToolRequest(
				configuration,
				{ sensor_id: "sensor-1" },
				{
					resolveHostname: publicResolver,
					sendRequest: async () => ({
						status: 200,
						body: new TextEncoder().encode("secret invalid response"),
					}),
				},
			),
		).rejects.toEqual(
			expect.objectContaining({
				code: "INVALID_JSON",
				message: "Custom tool returned invalid JSON.",
			}),
		);
	});

	it("rejects JSON text containing invalid UTF-8", async () => {
		await expect(
			invokeCustomToolRequest(
				configuration,
				{ sensor_id: "sensor-1" },
				{
					resolveHostname: publicResolver,
					sendRequest: async () => ({
						status: 200,
						body: new Uint8Array([0x22, 0xc3, 0x28, 0x22]),
					}),
				},
			),
		).rejects.toMatchObject({ code: "INVALID_JSON" });
	});
});

describe("custom tool input validation", () => {
	it.each([
		{
			input: {},
			message: "Missing required custom tool parameter: sensor_id.",
		},
		{
			input: { sensor_id: 42 },
			message: "Custom tool parameter sensor_id must be a string.",
		},
		{
			input: { sensor_id: "sensor-1", extra: true },
			message: "Unknown custom tool parameter: extra.",
		},
	])("rejects $message", ({ input, message }) => {
		expect(() =>
			validateCustomToolInput(configuration.parameters, input),
		).toThrow(message);
	});

	it("uses stable sanitized error objects", () => {
		let thrown: unknown;
		try {
			validateCustomToolInput(configuration.parameters, null);
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(CustomToolExecutionError);
		expect(thrown).toMatchObject({
			code: "INVALID_INPUT",
			message: "Custom tool input must be an object.",
		});
	});

	it("does not mistake inherited object properties for supplied input", () => {
		expect(
			validateCustomToolInput(
				[
					{
						name: "toString",
						type: "string",
						description: "Optional inherited name",
						required: false,
					},
				],
				{},
			),
		).toEqual({});
		expect(() =>
			validateCustomToolInput(
				[
					{
						name: "constructor",
						type: "string",
						description: "Required inherited name",
						required: true,
					},
				],
				{},
			),
		).toThrow("Missing required custom tool parameter: constructor.");
	});
});
