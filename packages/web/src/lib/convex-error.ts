import { ConvexError } from "convex/values";

export function getConvexErrorMessage(
	error: unknown,
	fallback = "Something went wrong.",
) {
	if (
		error instanceof ConvexError &&
		typeof error.data === "object" &&
		error.data !== null &&
		"message" in error.data &&
		typeof error.data.message === "string"
	) {
		return error.data.message;
	}

	return error instanceof Error ? error.message : fallback;
}
