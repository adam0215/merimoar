import { describe, expect, it } from "vitest";
import {
	composeCustomToolEndpoint,
	computeCustomToolConfigurationHash,
	normalizeCustomIntegrationBaseUrl,
	normalizeCustomToolFields,
	normalizeCustomToolName,
} from "./customToolModel";

describe("custom tool model", () => {
	it("normalizes display names into stable ASCII machine names", () => {
		expect(normalizeCustomToolName(" Read Témperature Metrics ")).toBe(
			"read_temperature_metrics",
		);
	});

	it.each([
		"___",
		"123",
		"123 report",
		"🔥",
	])("rejects names without a leading ASCII letter: %s", (name) => {
		expect(() => normalizeCustomToolName(name)).toThrow(
			"start with an ASCII letter",
		);
	});

	it("preserves JSON-compatible parameter names exactly", () => {
		const names = [
			"",
			"camelCase",
			"kebab-case",
			" spaced key ",
			"ümlaut",
			"$schema",
			"__proto__",
			'quote"slash\\',
			"line\nbreak",
		];
		const fields = normalizeCustomToolFields({
			name: "Read metrics",
			description: "Reads metrics.",
			path: "metrics",
			requiresApproval: false,
			parameters: names.map((name) => ({
				name,
				type: "string" as const,
				description: "Value",
				required: false,
			})),
		});

		expect(fields.parameters.map((parameter) => parameter.name)).toEqual(names);
	});

	it("rejects duplicate parameter names", () => {
		expect(() =>
			normalizeCustomToolFields({
				name: "Read metrics",
				description: "Reads metrics.",
				path: "metrics",
				requiresApproval: true,
				parameters: [
					{
						name: "sensor_id",
						type: "string",
						description: "Sensor identifier",
						required: true,
					},
					{
						name: "sensor_id",
						type: "number",
						description: "Duplicate",
						required: false,
					},
				],
			}),
		).toThrow("duplicated");
	});

	it.each([
		"https://example.com/api?token=secret",
		"https://example.com/api?",
		"https://example.com/api#",
		"https://user@example.com/api",
		"https://example.com/a\\b",
		"ftp://example.com/api",
	])("rejects unsafe base URLs: %s", (baseUrl) => {
		expect(() => normalizeCustomIntegrationBaseUrl(baseUrl)).toThrow(
			/Base URL/,
		);
	});

	it("preserves a base path when composing the endpoint", () => {
		expect(
			composeCustomToolEndpoint("https://example.com/api/v1/", "metrics"),
		).toBe("https://example.com/api/v1/metrics");
	});

	it.each([
		"/metrics",
		"//evil.example/path",
		"/../admin",
		"/%2f%2fevil",
		"/a\\b",
	])("rejects paths that can escape URL composition: %s", (path) => {
		expect(() =>
			composeCustomToolEndpoint("https://example.com/api", path),
		).toThrow(/Tool path/);
	});

	it("hashes only request-affecting configuration canonically", async () => {
		const input = {
			baseUrl: "https://example.com/api/",
			path: "metrics",
			parameters: [
				{
					name: "limit",
					type: "number" as const,
					description: "Maximum rows",
					required: false,
				},
			],
		};
		const hash = await computeCustomToolConfigurationHash(input);
		expect(hash).toMatch(/^[a-f0-9]{64}$/);
		expect(await computeCustomToolConfigurationHash(input)).toBe(hash);
		expect(
			await computeCustomToolConfigurationHash({
				...input,
				path: "other",
			}),
		).not.toBe(hash);
	});
});
