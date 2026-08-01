import { api } from "@merimoar/convex/api";
import {
	IconAddressBook,
	IconArrowRight,
	IconClock,
	IconFolder,
	IconInbox,
	IconRobot,
} from "@tabler/icons-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { usePaginatedQuery, useQuery } from "convex-helpers/react/cache";
import { CaseStatusDot } from "#/components/case/case-status.tsx";
import { OverviewMetric } from "#/components/overview-metric.tsx";
import { createAuthenticatedConvexHttpClient } from "#/integrations/convex/server.ts";
import { formatShortDate } from "#/lib/date-format.ts";

const ASSIGNED_CASES_PAGE_SIZE = 8;

const preloadMyOverview = createServerFn({ method: "GET" }).handler(
	async () => {
		const client = await createAuthenticatedConvexHttpClient();
		const [cases, stats] = await Promise.all([
			client.query(api.case.reader.list, {
				view: "assigned_to_me",
				paginationOpts: {
					cursor: null,
					numItems: ASSIGNED_CASES_PAGE_SIZE,
				},
			}),
			client.query(api.case.reader.getMyOverviewStats, {}),
		]);
		return { cases, stats };
	},
);

export const Route = createFileRoute("/_authenticated/")({
	loader: () => preloadMyOverview(),
	component: MyOverviewPage,
});

function MyOverviewPage() {
	const prefetchedCases = Route.useLoaderData();
	const { results: liveCases, status } = usePaginatedQuery(
		api.case.reader.list,
		{ view: "assigned_to_me" },
		{ initialNumItems: ASSIGNED_CASES_PAGE_SIZE },
	);
	const liveStats = useQuery(api.case.reader.getMyOverviewStats, {});
	const cases =
		status === "LoadingFirstPage" ? prefetchedCases.cases.page : liveCases;
	const stats = liveStats ?? prefetchedCases.stats;
	const assignedCaseCount = `${stats.assignedCaseCount}${stats.hasMoreThan99AssignedCases ? "+" : ""}`;
	const latestActivity = stats.latestCaseActivityAt
		? formatShortDate(stats.latestCaseActivityAt)
		: "No activity";

	return (
		<div className="h-full overflow-y-auto">
			<div className="w-full p-6">
				<h1 className="text-2xl font-semibold">My overview</h1>

				<div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
					<div className="space-y-8">
						<section aria-labelledby="overview-summary-heading">
							<h2 id="overview-summary-heading" className="font-semibold">
								At a glance
							</h2>

							<div className="mt-3 grid grid-cols-2 gap-3">
								<OverviewMetric
									label="Assigned cases"
									value={assignedCaseCount}
									icon={<IconFolder />}
								/>
								<OverviewMetric
									label="Latest case activity"
									value={latestActivity}
									icon={<IconClock />}
								/>
							</div>
						</section>

						<section aria-labelledby="quick-links-heading">
							<h2 id="quick-links-heading" className="font-semibold">
								Quick links
							</h2>
							<nav className="mt-3 grid gap-2" aria-label="Quick links">
								<OverviewLink
									to="/email"
									label="Inboxes"
									icon={<IconInbox />}
								/>
								<OverviewLink to="/cases" label="Cases" icon={<IconFolder />} />
								<OverviewLink
									to="/contacts"
									label="Contacts"
									icon={<IconAddressBook />}
								/>
								<Link
									to="/agents"
									search={{ view: "tasks" }}
									className={OVERVIEW_LINK_CLASS_NAME}
								>
									<span className="text-muted-foreground [&>svg]:size-4">
										<IconRobot />
									</span>
									<span>Agent tasks</span>
									<IconArrowRight className="ml-auto size-4 text-muted-foreground" />
								</Link>
							</nav>
						</section>
					</div>

					<section aria-labelledby="assigned-cases-heading">
						<div className="flex items-center justify-between gap-4">
							<h2 id="assigned-cases-heading" className="font-semibold">
								Assigned to me
							</h2>
							<Link
								to="/cases"
								search={{ view: "assigned_to_me" }}
								className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-muted-foreground no-underline hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								View all
								<IconArrowRight className="size-4" />
							</Link>
						</div>

						<div className="mt-3 overflow-hidden rounded-2xl border">
							{cases.length === 0 && (
								<div className="flex flex-col items-center px-6 py-12 text-center">
									<IconFolder className="size-6 text-muted-foreground/50" />
									<p className="mt-3 font-medium">No assigned cases</p>
								</div>
							)}

							{cases.map((item) => (
								<Link
									key={item.case._id}
									to="/cases"
									search={{
										case: item.case._id,
										view: "assigned_to_me",
									}}
									className="flex items-center gap-3 border-b px-4 py-3.5 text-foreground no-underline outline-none last:border-b-0 hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
								>
									<CaseStatusDot status={item.case.status} />
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium">
											{item.case.title}
										</p>
										<p className="mt-1 text-xs text-muted-foreground">
											{item.case.reference}
											<span aria-hidden> · </span>
											{formatShortDate(item.case.lastActivityAt)}
										</p>
									</div>
									<IconArrowRight className="size-4 shrink-0 text-muted-foreground" />
								</Link>
							))}
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}

const OVERVIEW_LINK_CLASS_NAME =
	"flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium text-foreground no-underline outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring";

function OverviewLink({
	to,
	label,
	icon,
}: {
	to: "/email" | "/cases" | "/contacts";
	label: string;
	icon: React.ReactNode;
}) {
	return (
		<Link to={to} search={{}} className={OVERVIEW_LINK_CLASS_NAME}>
			<span className="text-muted-foreground [&>svg]:size-4">{icon}</span>
			<span>{label}</span>
			<IconArrowRight className="ml-auto size-4 text-muted-foreground" />
		</Link>
	);
}
