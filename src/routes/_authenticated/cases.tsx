import { IconArrowLeft } from "@tabler/icons-react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { usePaginatedQuery, useQuery } from "convex-helpers/react/cache";
import { CaseList } from "#/components/case/case-list.tsx";
import { CaseView } from "#/components/case/case-view.tsx";
import { Button } from "#/components/ui/button.tsx";
import { createAuthenticatedConvexHttpClient } from "#/integrations/convex/server.ts";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";

type CasesSearch = {
	case?: string;
};

const preloadInitialCasePage = createServerFn({ method: "GET" })
	.validator((input: { selectedCaseId?: string }) => input)
	.handler(async ({ data }) => {
		const client = await createAuthenticatedConvexHttpClient();
		const [cases, selectedCase, createOptions] = await Promise.all([
			client.query(api.case.reader.list, {
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

export const Route = createFileRoute("/_authenticated/cases")({
	validateSearch: (search: Record<string, unknown>): CasesSearch => ({
		case: typeof search.case === "string" ? search.case : undefined,
	}),
	loaderDeps: ({ search }) => ({ selectedCaseId: search.case }),
	loader: ({ deps }) => preloadInitialCasePage({ data: deps }),
	component: CasesPage,
});

function CasesPage() {
	const prefetched = Route.useLoaderData();
	const { case: selectedCaseId } = Route.useSearch();
	const navigate = useNavigate({ from: "/cases" });
	const {
		results: liveCases,
		status: liveCaseStatus,
		loadMore,
	} = usePaginatedQuery(api.case.reader.list, {}, { initialNumItems: 30 });
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

	return (
		<div className="grid h-full min-h-0 overflow-hidden md:grid-cols-[22rem_minmax(0,1fr)] xl:grid-cols-[25rem_minmax(0,1fr)]">
			<section
				className={cn(
					"min-h-0 overflow-hidden border-r bg-background",
					selectedCaseId && "hidden md:block",
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
					onCaseCreated={(caseId) => navigate({ search: { case: caseId } })}
				/>
			</section>

			<section
				className={cn(
					"min-h-0 min-w-0 overflow-hidden bg-background",
					!selectedCaseId && "hidden md:block",
				)}
			>
				<div className="flex h-full min-h-0 flex-col">
					<div className="flex h-12 shrink-0 items-center border-b px-3 md:hidden">
						<Button
							nativeButton={false}
							variant="ghost"
							size="sm"
							render={<Link to="/cases" search={{}} />}
						>
							<IconArrowLeft />
							Back to cases
						</Button>
					</div>
					<div className="min-h-0 flex-1">
						<CaseView
							key={selectedCaseId ?? "no-case"}
							detail={selectedDetail}
							caseWasSelected={Boolean(selectedCaseId)}
							createOptions={createOptions}
						/>
					</div>
				</div>
			</section>
		</div>
	);
}
