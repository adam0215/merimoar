import { describe, expect, it } from "vitest";
import { defaultAgentDefinition } from "./manifest";

describe("agent manifest", () => {
	it("uses GPT-5.6 Luna as the default runtime model", () => {
		expect(defaultAgentDefinition.defaultModel).toBe("gpt-5.6-luna");
	});
});
