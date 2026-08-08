import { api } from "@merimoar/convex/api";
import { IconArrowLeft, IconX } from "@tabler/icons-react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { usePaginatedQuery, useQuery } from "convex-helpers/react/cache";
import { useState } from "react";
import { CaseList } from "#/components/case/case-list.tsx";
import {
	type CaseView,
	type CaseViewFilter,
	isCaseViewFilter,
} from "#/components/case/case-status.tsx";
import { CaseView as CaseDetailPanel } from "#/components/case/case-view.tsx";
import { Button } from "#/components/ui/button.tsx";
import { createAuthenticatedConvexHttpClient } from "#/integrations/convex/server.ts";
import { cn } from "#/lib/utils.ts";

type CasesSearch = {
	case?: string;
	view?: CaseViewFilter;
};

const preloadInitialCasePage = createServerFn({ method: "GET" })
	.validator(
		(input: { selectedCaseId?: string; view?: CaseViewFilter }) => input,
	)
	.handler(async ({ data }) => {
		const client = await createAuthenticatedConvexHttpClient();
		const [cases, selectedCase, createOptions] = await Promise.all([
			client.query(api.case.reader.list, {
				view: data.view,
				now: data.view === "overdue" ? Date.now() : undefined,
				paginationOpts: {
					cursor: null,
					numItems: 30,
				},
			}),
			data.selectedCaseId
				? client.query(api.case.reader.get, {
						caseId: data.selectedCaseId,
					})
				: null,
			client.query(api.case.reader.getCreateOptions, {}),
		]);

		return {
			cases,
			createOptions,
			selectedCase,
			selectedCaseId: data.selectedCaseId,
		};
	});

export const Route = createFileRoute("/_authenticated/(work)/cases")({
	validateSearch: (search: Record<string, unknown>): CasesSearch => ({
		case: typeof search.case === "string" ? search.case : undefined,
		view: isCaseViewFilter(search.view) ? search.view : undefined,
	}),
	loaderDeps: ({ search }) => ({
		selectedCaseId: search.case,
		view: search.view,
	}),
	loader: ({ deps }) => preloadInitialCasePage({ data: deps }),
	component: CasesPage,
});

function CasesPage() {
	const prefetched = Route.useLoaderData();
	const { case: selectedCaseId, view: selectedView } = Route.useSearch();
	const hasOpenCase = Boolean(selectedCaseId);
	const view: CaseView = selectedView ?? "all";
	const [overdueCutoff] = useState(Date.now);
	const navigate = useNavigate({ from: "/cases" });
	const {
		results: liveCases,
		status: liveCaseStatus,
		loadMore,
	} = usePaginatedQuery(
		api.case.reader.list,
		{
			view: selectedView,
			now: selectedView === "overdue" ? overdueCutoff : undefined,
		},
		{ initialNumItems: 30 },
	);
	const canUsePrefetchedCases = liveCaseStatus === "LoadingFirstPage";
	const cases = canUsePrefetchedCases ? prefetched.cases.page : liveCases;
	const caseStatus = canUsePrefetchedCases
		? prefetched.cases.isDone
			? "Exhausted"
			: "CanLoadMore"
		: liveCaseStatus;
	const liveDetail = useQuery(
		api.case.reader.get,
		selectedCaseId ? { caseId: selectedCaseId } : "skip",
	);
	const canUsePrefetchedDetail =
		liveDetail === undefined && selectedCaseId === prefetched.selectedCaseId;
	const detail = canUsePrefetchedDetail ? prefetched.selectedCase : liveDetail;
	const selectedDetail =
		detail?.case._id === selectedCaseId ? detail : undefined;
	const liveCreateOptions = useQuery(api.case.reader.getCreateOptions, {});
	const createOptions = liveCreateOptions ?? prefetched.createOptions;
	const closeCaseButton = (
		<Button
			nativeButton={false}
			variant="ghost"
			size="icon-sm"
			render={
				<Link
					to="/cases"
					search={{ view: selectedView }}
					aria-label="Close case"
					title="Close case"
				/>
			}
		>
			<IconX />
		</Button>
	);

	return (
		<div
			className={cn(
				"grid h-full min-h-0 grid-cols-1 overflow-hidden",
				hasOpenCase &&
					"md:grid-cols-[22rem_minmax(0,1fr)] xl:grid-cols-[25rem_minmax(0,1fr)]",
			)}
		>
			<section
				className={cn(
					"min-h-0 overflow-hidden bg-background",
					hasOpenCase && "hidden md:block md:border-r",
				)}
			>
				<CaseList
					items={cases}
					selectedCaseId={selectedCaseId}
					status={caseStatus}
					loadMore={() => {
						if (liveCaseStatus !== "LoadingFirstPage") {
							loadMore(30);
						}
					}}
					createOptions={createOptions}
					onCaseCreated={(caseId) =>
						navigate({
							search: {
								case: caseId,
								view: selectedView,
							},
						})
					}
					view={view}
					onViewChange={(nextView) =>
						navigate({
							search: {
								case: selectedCaseId,
								view: nextView === "all" ? undefined : nextView,
							},
						})
					}
				/>
			</section>

			{hasOpenCase && (
				<section className="min-h-0 min-w-0 overflow-hidden bg-background">
					<div className="flex h-full min-h-0 flex-col">
						<div className="flex h-12 shrink-0 items-center border-b px-3 md:hidden">
							<Button
								nativeButton={false}
								variant="ghost"
								size="sm"
								render={
									<Link
										to="/cases"
										search={{
											view: selectedView,
										}}
									/>
								}
							>
								<IconArrowLeft />
								Back to cases
							</Button>
						</div>
						<div className="min-h-0 flex-1">
							<CaseDetailPanel
								key={selectedCaseId}
								detail={selectedDetail}
								createOptions={createOptions}
								closeButton={closeCaseButton}
								onCaseDeleted={() => {
									void navigate({
										search: { view: selectedView },
									});
								}}
							/>
						</div>
					</div>
				</section>
			)}
		</div>
	);
}
