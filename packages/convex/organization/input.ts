import * as v from "valibot";

export const organizationReferenceSlugSchema = v.pipe(
	v.string(),
	v.trim(),
	v.toUpperCase(),
	v.minLength(2, "Use minimum 2 characters"),
	v.maxLength(4, "Use maximum 4 characters"),
	v.regex(/^[A-Z]+$/, "Use letters only"),
);
