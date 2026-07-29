import { IconFolder, IconLoader2, IconUser } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { Button } from "#/components/ui/button.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { cn } from "#/lib/utils.ts";
import type { Id } from "../../../convex/_generated/dataModel";
import {
	CASE_VIEW_OPTIONS,
	CaseStatusDot,
	type CaseView,
	CaseViewIndicator,
} from "./case-status.tsx";
import { CreateCaseDialog } from "./create-case-dialog.tsx";
import { formatShortDate } from "./format.ts";
import type {
	CaseCreateOptions,
	CaseListItem,
	PaginationStatus,
} from "./types.ts";

const LIST_SKELETONS = ["case-a", "case-b", "case-c", "case-d", "case-e"];

export function CaseList({
	items,
	selectedCaseId,
	status,
	loadMore,
	createOptions,
	onCaseCreated,
	view,
	onViewChange,
}: {
	items: CaseListItem[];
	selectedCaseId?: string;
	status: PaginationStatus;
	loadMore: () => void;
	createOptions: CaseCreateOptions | undefined;
	onCaseCreated: (caseId: Id<"cases">) => void;
	view: CaseView;
	onViewChange: (view: CaseView) => void;
}) {
	const viewFilter = view === "all" ? undefined : view;

	return (
		<div className="relative flex h-full min-h-0 flex-col">
			<div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
				<span className="text-sm font-medium">Views</span>
				<Select
					items={CASE_VIEW_OPTIONS}
					value={view}
					onValueChange={(nextView) => {
						if (nextView) {
							onViewChange(nextView);
						}
					}}
				>
					<SelectTrigger size="sm" className="min-w-40">
						<SelectValue />
					</SelectTrigger>
					<SelectContent align="end">
						{CASE_VIEW_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								<CaseViewIndicator view={option.value} />
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-none p-2 pb-20">
				{status === "LoadingFirstPage" &&
					LIST_SKELETONS.map((item) => (
						<div key={item} className="mb-1 rounded-xl px-3 py-3.5">
							<div className="flex items-center justify-between">
								<Skeleton className="h-3 w-20" />
								<Skeleton className="h-3 w-14" />
							</div>
							<Skeleton className="mt-2 h-4 w-4/5" />
							<Skeleton className="mt-2 h-3 w-2/5" />
						</div>
					))}

				{status !== "LoadingFirstPage" && items.length === 0 && (
					<div className="flex h-full flex-col items-center justify-center px-8 text-center">
						<IconFolder className="mb-4 size-6 text-muted-foreground/50" />
						<h2 className="font-medium">No cases in this view</h2>
						<p className="mt-1 max-w-64 text-sm text-muted-foreground">
							Matching cases will appear here.
						</p>
					</div>
				)}

				{items.map((item) => {
					const isSelected = item.case._id === selectedCaseId;

					return (
						<Link
							key={item.case._id}
							to="/cases"
							search={{
								case: item.case._id,
								view: viewFilter,
							}}
							className={cn(
								"mb-1 block rounded-xl px-3 py-3.5 text-foreground no-underline outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
								isSelected && "bg-muted",
							)}
						>
							<div className="flex items-center gap-2 text-xs">
								<CaseStatusDot status={item.case.status} className="size-1.5" />
								<span className="font-medium text-muted-foreground">
									{item.case.reference}
								</span>
								<time className="ml-auto text-muted-foreground">
									{formatShortDate(item.case.lastActivityAt)}
								</time>
							</div>
							<p className="mt-1.5 line-clamp-2 text-sm font-medium leading-5">
								{item.case.title}
							</p>
							<div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
								<IconUser className="size-3.5" />
								<span className="truncate">
									{item.owner?.name ?? "Unassigned"}
								</span>
								{item.case.dueAt && (
									<>
										<span aria-hidden>·</span>
										<span className="truncate">
											Due {formatShortDate(item.case.dueAt)}
										</span>
									</>
								)}
							</div>
						</Link>
					);
				})}

				{status !== "Exhausted" && status !== "LoadingFirstPage" && (
					<div className="flex justify-center py-3">
						<Button
							variant="ghost"
							size="sm"
							onClick={loadMore}
							disabled={status === "LoadingMore"}
						>
							{status === "LoadingMore" && (
								<IconLoader2 className="animate-spin" />
							)}
							Load more
						</Button>
					</div>
				)}
			</div>
			<div className="absolute right-4 bottom-4 z-20">
				<CreateCaseDialog options={createOptions} onCreated={onCaseCreated} />
			</div>
		</div>
	);
}
