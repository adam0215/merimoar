import * as v from "valibot";

export const identifierSchema = v.pipe(
	v.string(),
	v.minLength(1),
	v.maxLength(200),
);

export const caseTitleSchema = v.pipe(
	v.string(),
	v.minLength(2),
	v.maxLength(160),
);
