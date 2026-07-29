import * as v from "valibot";

export const emailInboxNameSchema = v.pipe(
	v.string(),
	v.trim(),
	v.minLength(2, "Use at least 2 characters."),
	v.maxLength(80, "Use no more than 80 characters."),
);

export const emailInboxAddressSchema = v.pipe(
	v.string(),
	v.trim(),
	v.toLowerCase(),
	v.nonEmpty("Enter the inbox address."),
	v.email("Enter a valid email address."),
);

export const emailInboxDetailsSchema = v.object({
	displayName: emailInboxNameSchema,
	address: emailInboxAddressSchema,
});
