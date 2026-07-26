import * as v from "valibot";

export const emailConnectionDisplayNameSchema = v.pipe(
	v.string(),
	v.trim(),
	v.minLength(2, "Use at least 2 characters."),
	v.maxLength(80, "Use no more than 80 characters."),
);

export const emailConnectionAddressSchema = v.pipe(
	v.string(),
	v.trim(),
	v.toLowerCase(),
	v.nonEmpty("Enter the receiving address."),
	v.email("Enter a valid email address."),
);

export const emailConnectionDetailsSchema = v.object({
	displayName: emailConnectionDisplayNameSchema,
	address: emailConnectionAddressSchema,
});

export const emailConnectionInputSchema = v.object({
	provider: v.literal("resend"),
	...emailConnectionDetailsSchema.entries,
});
