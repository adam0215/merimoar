import { describe, expect, it, vi } from "vitest";
import { createAgentTools } from "./custom-tools";
import { createLocalAgentContext } from "./local-context";
import type { CustomToolDefinition } from "./types";

function definition(
	overrides: Partial<CustomToolDefinition> = {},
): CustomToolDefinition {
	return {
		toolId: "tool-1",
		name: "Read temperature",
		normalizedName: "read_temperature",
		description: "Read the current temperature.",
		parameters: [
			{
				name: "sensor_id",
				type: "string",
				description: "Sensor identifier",
				required: true,
			},
		],
		requiresApproval: true,
		baseUrl: "https://api.example.com",
		path: "temperature",
		...overrides,
	};
}

describe("dynamic custom tools", () => {
	it("merges custom tools with built-ins and uses the existing approval flag", async () => {
		const context = createLocalAgentContext();
		const invokeCustomTool = vi.fn<
			(toolId: string, input: Record<string, unknown>) => Promise<unknown>
		>(async (_toolId, input) => input);
		context.capabilities.invokeCustomTool = invokeCustomTool;
		const tools = createAgentTools(context, [definition()]);
		const custom = tools.read_temperature as {
			needsApproval?: boolean;
			execute?: (input: Record<string, unknown>) => Promise<unknown>;
		};

		expect(Object.isFrozen(tools)).toBe(true);
		expect(tools).toHaveProperty("read_case");
		expect(custom.needsApproval).toBe(true);
		await expect(custom.execute?.({ sensor_id: "sensor-1" })).resolves.toEqual({
			sensor_id: "sensor-1",
		});
		expect(invokeCustomTool).toHaveBeenCalledWith("tool-1", {
			sensor_id: "sensor-1",
		});
	});

	it("maps approval false without a parallel approval contract", () => {
		const tools = createAgentTools(createLocalAgentContext(), [
			definition({ requiresApproval: false }),
		]);
		expect(tools.read_temperature).toMatchObject({ needsApproval: false });
	});

	it("preserves arbitrary parameter names in the JSON schema", async () => {
		const names = ["", "__proto__", "camelCase"];
		const custom = createAgentTools(createLocalAgentContext(), [
			definition({
				parameters: names.map((name) => ({
					name,
					type: "string" as const,
					description: "Value",
					required: name !== "camelCase",
				})),
			}),
		]).read_temperature!;
		const schema = await (
			custom.inputSchema as {
				jsonSchema:
					| PromiseLike<Record<string, unknown>>
					| Record<string, unknown>;
			}
		).jsonSchema;
		const properties = schema.properties as Record<string, unknown>;

		expect(Object.keys(properties)).toEqual(["", "__proto__", "camelCase"]);
		expect(Object.hasOwn(properties, "__proto__")).toBe(true);
		expect(schema.required).toEqual(["", "__proto__"]);
	});

	it("rejects built-in and custom collisions defensively", () => {
		const context = createLocalAgentContext();
		expect(() =>
			createAgentTools(context, [definition({ normalizedName: "read_case" })]),
		).toThrow("Duplicate agent tool name: read_case");
		expect(() =>
			createAgentTools(context, [
				definition(),
				definition({ toolId: "tool-2" }),
			]),
		).toThrow("Duplicate agent tool name: read_temperature");
	});

	it("captures tool definitions when the run tool map is created", () => {
		const mutableDefinition = definition();
		const tools = createAgentTools(createLocalAgentContext(), [
			mutableDefinition,
		]);
		mutableDefinition.description = "Changed after run start.";
		expect(tools.read_temperature).toMatchObject({
			description: "Read the current temperature.",
		});
	});
});
