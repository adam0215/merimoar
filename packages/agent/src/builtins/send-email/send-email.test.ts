import { valibotSchema } from "@ai-sdk/valibot";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { emailBodySchema } from "./ai-sdk";

describe("send_email", () => {
	it("accepts at most 50,000 characters without changing the body", () => {
		const exactLimit = `  ${"x".repeat(49_996)}  `;
		const result = v.safeParse(emailBodySchema, exactLimit);

		expect(result).toMatchObject({ success: true, output: exactLimit });
		expect(v.safeParse(emailBodySchema, "x".repeat(50_001)).success).toBe(
			false,
		);
	});

	it("rejects an empty or whitespace-only body", () => {
		for (const body of ["", " \n\t "]) {
			expect(v.safeParse(emailBodySchema, body).success).toBe(false);
		}
	});

	it("converts the body contract to model-facing JSON Schema", () => {
		expect(valibotSchema(emailBodySchema).jsonSchema).toMatchObject({
			type: "string",
			maxLength: 50_000,
			pattern: "\\S",
		});
	});
});
