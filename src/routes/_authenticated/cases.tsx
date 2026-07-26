import { IconArrowLeft } from "@tabler/icons-react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex-helpers/react/cache";
import { CaseList } from "#/components/case/case-list.tsx";
import { CaseView } from "#/components/case/case-view.tsx";
import { Button } from "#/components/ui/button.tsx";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";

type CasesSearch = {
	case?: string;
};

export const Route = createFileRoute("/_authenticated/cases")({
	validateSearch: (search: Record<string, unknown>): CasesSearch => ({
		case: typeof search.case === "string" ? search.case : undefined,
	}),
	component: CasesPage,
});

function CasesPage() {
	const { case: selectedCaseId } = Route.useSearch();
	const navigate = useNavigate({ from: "/cases" });
	const {
		results: cases,
		status,
		loadMore,
	} = usePaginatedQuery(api.case.reader.list, {}, { initialNumItems: 30 });
	const detail = useQuery(
		api.case.reader.get,
		selectedCaseId ? { caseId: selectedCaseId } : "skip",
	);
	const selectedDetail =
		detail?.case._id === selectedCaseId ? detail : undefined;
	const createOptions = useQuery(api.case.reader.getCreateOptions, {});

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
					status={status}
					loadMore={() => loadMore(30)}
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
						<Button asChild variant="ghost" size="sm">
							<Link to="/cases" search={{}}>
								<IconArrowLeft />
								Back to cases
							</Link>
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
