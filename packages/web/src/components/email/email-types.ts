import type { api } from "@merimoar/convex/api";
import type { FunctionReturnType } from "convex/server";
export type EmailThreadDetail = NonNullable<
	FunctionReturnType<typeof api.email.reader.getThread>
>;
