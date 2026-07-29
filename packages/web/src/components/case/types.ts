import type { api } from "@merimoar/convex/api";
import type { FunctionReturnType } from "convex/server";

export type PaginationStatus =
	| "LoadingFirstPage"
	| "CanLoadMore"
	| "LoadingMore"
	| "Exhausted";

export type CaseListItem = FunctionReturnType<
	typeof api.case.reader.list
>["page"][number];

export type CaseDetail = NonNullable<
	FunctionReturnType<typeof api.case.reader.get>
>;

export type CaseCreateOptions = FunctionReturnType<
	typeof api.case.reader.getCreateOptions
>;
