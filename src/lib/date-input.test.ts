import { describe, expect, it } from "vitest";
import { formatDateInput, parseDateInput } from "./date-input";

describe("date input conversion", () => {
	it("round-trips a valid local calendar date", () => {
		expect(formatDateInput(parseDateInput("2026-07-26"))).toBe("2026-07-26");
		expect(formatDateInput(parseDateInput("2024-02-29"))).toBe("2024-02-29");
	});

	it.each([
		"",
		"2026-2-03",
		"2026-02-29",
		"2026-02-31",
	])("rejects invalid date input %s", (value) => {
		expect(parseDateInput(value)).toBeNaN();
	});

	it("returns an empty input value for an invalid timestamp", () => {
		expect(formatDateInput(Number.NaN)).toBe("");
	});
});
