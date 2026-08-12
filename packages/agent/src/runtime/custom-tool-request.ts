import { lookup } from "node:dns/promises";
import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import { BlockList, isIP } from "node:net";
import type { CustomToolParameter } from "../types";

const CUSTOM_TOOL_TIMEOUT_MS = 10_000;
export const CUSTOM_TOOL_MAX_RESPONSE_BYTES = 65_536;

export type CustomToolRequestConfiguration = {
	endpoint: string;
	parameters: readonly CustomToolParameter[];
};

type ResolvedAddress = { address: string; family: 4 | 6 };

type PinnedLookupCallback = (
	error: NodeJS.ErrnoException | null,
	address: string | ResolvedAddress[],
	family?: number,
) => void;

type PinnedResponse = {
	status: number;
	body: Uint8Array;
};

type ExecutorDependencies = {
	resolveHostname(hostname: string): Promise<ResolvedAddress[]>;
	sendRequest(input: {
		endpoint: URL;
		address: ResolvedAddress;
		body: string;
		signal: AbortSignal;
	}): Promise<PinnedResponse>;
	timeoutMs?: number;
	development?: boolean;
};

type CustomToolExecutionCode =
	| "INVALID_INPUT"
	| "UNSAFE_DESTINATION"
	| "REQUEST_FAILED"
	| "TIMEOUT"
	| "RESPONSE_TOO_LARGE"
	| "UNEXPECTED_STATUS"
	| "INVALID_JSON";

export class CustomToolExecutionError extends Error {
	constructor(
		readonly code: CustomToolExecutionCode,
		message: string,
	) {
		super(message);
		this.name = "CustomToolExecutionError";
	}
}

function executionError(code: CustomToolExecutionCode, message: string): never {
	throw new CustomToolExecutionError(code, message);
}

function isPlainInput(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

export function validateCustomToolInput(
	parameters: readonly CustomToolParameter[],
	input: unknown,
) {
	if (!isPlainInput(input)) {
		executionError("INVALID_INPUT", "Custom tool input must be an object.");
	}
	const definitions = new Map(
		parameters.map((parameter) => [parameter.name, parameter]),
	);
	for (const key of Object.keys(input)) {
		if (!definitions.has(key)) {
			executionError("INVALID_INPUT", `Unknown custom tool parameter: ${key}.`);
		}
	}
	const validated: [string, string | number | boolean][] = [];
	for (const parameter of parameters) {
		if (!Object.hasOwn(input, parameter.name)) {
			if (parameter.required) {
				executionError(
					"INVALID_INPUT",
					`Missing required custom tool parameter: ${parameter.name}.`,
				);
			}
			continue;
		}
		const value = input[parameter.name];
		if (
			typeof value !== parameter.type ||
			(parameter.type === "number" && !Number.isFinite(value))
		) {
			executionError(
				"INVALID_INPUT",
				`Custom tool parameter ${parameter.name} must be a ${parameter.type}.`,
			);
		}
		validated.push([parameter.name, value as string | number | boolean]);
	}
	return Object.fromEntries(validated);
}

type BlockListEntry = readonly [string, number, "ipv4" | "ipv6"];

function createBlockList(entries: readonly BlockListEntry[]) {
	const list = new BlockList();
	for (const [address, prefix, family] of entries) {
		list.addSubnet(address, prefix, family);
	}
	return list;
}

const loopbackAddresses = createBlockList([
	["127.0.0.0", 8, "ipv4"],
	["::1", 128, "ipv6"],
]);

const blockedIpv4Addresses = createBlockList([
	["0.0.0.0", 8, "ipv4"],
	["10.0.0.0", 8, "ipv4"],
	["100.64.0.0", 10, "ipv4"],
	["127.0.0.0", 8, "ipv4"],
	["169.254.0.0", 16, "ipv4"],
	["172.16.0.0", 12, "ipv4"],
	["192.0.0.0", 24, "ipv4"],
	["192.0.2.0", 24, "ipv4"],
	["192.88.99.0", 24, "ipv4"],
	["192.168.0.0", 16, "ipv4"],
	["198.18.0.0", 15, "ipv4"],
	["198.51.100.0", 24, "ipv4"],
	["203.0.113.0", 24, "ipv4"],
	["224.0.0.0", 4, "ipv4"],
	["240.0.0.0", 4, "ipv4"],
]);

const publicIpv6Addresses = createBlockList([["2000::", 3, "ipv6"]]);
const blockedIpv6Addresses = createBlockList([
	["2001::", 23, "ipv6"],
	["2001:db8::", 32, "ipv6"],
	["2002::", 16, "ipv6"],
	["3fff::", 20, "ipv6"],
]);

function normalizedIpv6Address(address: string) {
	return address.split("%")[0] ?? "";
}

function isLoopbackAddress(address: ResolvedAddress) {
	return loopbackAddresses.check(
		address.family === 6
			? normalizedIpv6Address(address.address)
			: address.address,
		address.family === 4 ? "ipv4" : "ipv6",
	);
}

function isExplicitLoopbackHostname(hostname: string) {
	const literal =
		hostname.startsWith("[") && hostname.endsWith("]")
			? hostname.slice(1, -1)
			: hostname;
	if (literal.toLowerCase().replace(/\.$/, "") === "localhost") return true;
	const family = isIP(literal);
	return family === 4 || family === 6
		? isLoopbackAddress({ address: literal, family })
		: false;
}

function isPublicIpv4(address: string) {
	return isIP(address) === 4 && !blockedIpv4Addresses.check(address, "ipv4");
}

function isPublicIpv6(address: string) {
	const normalized = normalizedIpv6Address(address).toLowerCase();
	const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
	if (mappedIpv4) return isPublicIpv4(mappedIpv4);
	return (
		isIP(normalized) === 6 &&
		publicIpv6Addresses.check(normalized, "ipv6") &&
		!blockedIpv6Addresses.check(normalized, "ipv6")
	);
}

export function assertAllowedDestinationAddress(
	address: ResolvedAddress,
	allowLoopback: boolean,
) {
	if (allowLoopback && isLoopbackAddress(address)) return;
	const publicAddress =
		(address.family === 4 && isPublicIpv4(address.address)) ||
		(address.family === 6 && isPublicIpv6(address.address));
	if (!publicAddress) {
		executionError(
			"UNSAFE_DESTINATION",
			"Custom tool endpoint must resolve to a public address.",
		);
	}
}

async function resolveHostname(hostname: string): Promise<ResolvedAddress[]> {
	const literal =
		hostname.startsWith("[") && hostname.endsWith("]")
			? hostname.slice(1, -1)
			: hostname;
	const family = isIP(literal);
	if (family === 4 || family === 6) {
		return [{ address: literal, family }];
	}
	const addresses = await lookup(literal, { all: true, verbatim: true });
	return addresses.flatMap((address) =>
		address.family === 4 || address.family === 6
			? [{ address: address.address, family: address.family }]
			: [],
	);
}

export function respondWithPinnedAddress(
	address: ResolvedAddress,
	all: boolean,
	callback: PinnedLookupCallback,
) {
	if (all) {
		callback(null, [address]);
		return;
	}
	callback(null, address.address, address.family);
}

async function sendPinnedRequest(input: {
	endpoint: URL;
	address: ResolvedAddress;
	body: string;
	signal: AbortSignal;
}): Promise<PinnedResponse> {
	return await new Promise((resolve, reject) => {
		const endpointHostname =
			input.endpoint.hostname.startsWith("[") &&
			input.endpoint.hostname.endsWith("]")
				? input.endpoint.hostname.slice(1, -1)
				: input.endpoint.hostname;
		let settled = false;
		const resolveOnce = (response: PinnedResponse) => {
			if (settled) return;
			settled = true;
			resolve(response);
		};
		const rejectOnce = (error: unknown) => {
			if (settled) return;
			settled = true;
			reject(error);
		};
		const request = (
			input.endpoint.protocol === "https:" ? requestHttps : requestHttp
		)(
			{
				protocol: input.endpoint.protocol,
				hostname: endpointHostname,
				port: input.endpoint.port || undefined,
				path: `${input.endpoint.pathname}${input.endpoint.search}`,
				method: "POST",
				headers: {
					Host: input.endpoint.host,
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(input.body),
				},
				lookup: (_hostname, options, callback) => {
					respondWithPinnedAddress(
						input.address,
						typeof options === "object" && options.all === true,
						callback,
					);
				},
				...(isIP(endpointHostname) === 0
					? { servername: endpointHostname }
					: {}),
				signal: input.signal,
			},
			async (response) => {
				try {
					const body = await readLimitedResponseBody(
						response,
						CUSTOM_TOOL_MAX_RESPONSE_BYTES,
					);
					resolveOnce({ status: response.statusCode ?? 0, body });
				} catch (error) {
					request.destroy();
					rejectOnce(error);
				}
			},
		);
		request.on("error", rejectOnce);
		request.end(input.body);
	});
}

export async function readLimitedResponseBody(
	stream: AsyncIterable<Uint8Array | string>,
	maximumBytes: number,
) {
	const chunks: Uint8Array[] = [];
	let byteLength = 0;
	for await (const chunk of stream) {
		const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
		byteLength += bytes.byteLength;
		if (byteLength > maximumBytes) {
			executionError(
				"RESPONSE_TOO_LARGE",
				"Custom tool response exceeded 64 KiB.",
			);
		}
		chunks.push(bytes);
	}
	return Buffer.concat(chunks, byteLength);
}

function isAbortError(error: unknown) {
	return (
		(error instanceof DOMException && error.name === "AbortError") ||
		(error instanceof Error && error.name === "AbortError")
	);
}

export async function invokeCustomToolRequest(
	configuration: CustomToolRequestConfiguration,
	input: unknown,
	dependencies: Partial<ExecutorDependencies> = {},
) {
	const endpoint = new URL(configuration.endpoint);
	const development =
		dependencies.development ?? process.env.NODE_ENV === "development";
	const explicitLoopback =
		development && isExplicitLoopbackHostname(endpoint.hostname);
	if (endpoint.protocol !== "https:" && !explicitLoopback) {
		executionError(
			"UNSAFE_DESTINATION",
			"Custom tool endpoints must use HTTPS.",
		);
	}
	const validatedInput = validateCustomToolInput(
		configuration.parameters,
		input,
	);
	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		dependencies.timeoutMs ?? CUSTOM_TOOL_TIMEOUT_MS,
	);
	const resolveDestination = dependencies.resolveHostname ?? resolveHostname;
	const request = dependencies.sendRequest ?? sendPinnedRequest;
	const startedAt = performance.now();
	try {
		const addresses = await Promise.race([
			resolveDestination(endpoint.hostname),
			new Promise<never>((_, reject) => {
				controller.signal.addEventListener(
					"abort",
					() => reject(new DOMException("Timed out", "AbortError")),
					{ once: true },
				);
			}),
		]);
		if (addresses.length === 0) {
			executionError(
				"REQUEST_FAILED",
				"Custom tool endpoint could not be resolved.",
			);
		}
		for (const address of addresses) {
			assertAllowedDestinationAddress(address, explicitLoopback);
		}
		if (
			explicitLoopback &&
			addresses.some((address) => !isLoopbackAddress(address))
		) {
			executionError(
				"UNSAFE_DESTINATION",
				"Custom tool loopback endpoint resolved outside loopback.",
			);
		}
		const response = await request({
			endpoint,
			address: addresses[0]!,
			body: JSON.stringify(validatedInput),
			signal: controller.signal,
		});
		if (response.body.byteLength > CUSTOM_TOOL_MAX_RESPONSE_BYTES) {
			executionError(
				"RESPONSE_TOO_LARGE",
				"Custom tool response exceeded 64 KiB.",
			);
		}
		if (response.status !== 200) {
			executionError(
				"UNEXPECTED_STATUS",
				`Custom tool returned HTTP ${response.status}; expected HTTP 200.`,
			);
		}
		let value: unknown;
		try {
			value = JSON.parse(
				new TextDecoder("utf-8", { fatal: true }).decode(response.body),
			);
		} catch {
			executionError("INVALID_JSON", "Custom tool returned invalid JSON.");
		}
		return {
			endpoint: endpoint.toString(),
			status: response.status,
			durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
			value,
		};
	} catch (error) {
		if (error instanceof CustomToolExecutionError) throw error;
		if (controller.signal.aborted || isAbortError(error)) {
			executionError(
				"TIMEOUT",
				"Custom tool request timed out after 10 seconds.",
			);
		}
		executionError("REQUEST_FAILED", "Custom tool request failed.");
	} finally {
		clearTimeout(timeout);
	}
}
