import * as v from "valibot";
import { CASE_STATUSES } from "./model";

export const caseTitleSchema = v.pipe(
	v.string(),
	v.trim(),
	v.minLength(2, "Use at least 2 characters."),
	v.maxLength(160, "Use no more than 160 characters."),
);

export const caseDescriptionSchema = v.pipe(v.string(), v.trim());

export const optionalCaseEventBodySchema = v.pipe(
	v.string(),
	v.trim(),
	v.maxLength(4000, "Use no more than 4,000 characters."),
);

export const caseEventBodySchema = v.pipe(
	optionalCaseEventBodySchema,
	v.minLength(1, "Write an event first."),
);

export const caseDetailsInputSchema = v.object({
	title: caseTitleSchema,
	description: caseDescriptionSchema,
	dueAt: v.nullable(
		v.pipe(
			v.number(),
			v.check(
				(value: number) => Number.isFinite(value),
				"Choose a valid deadline.",
			),
		),
	),
	status: v.picklist(CASE_STATUSES),
});
