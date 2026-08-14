import { api } from "@merimoar/convex/api";
import {
	IconArrowLeft,
	IconBaselineDensityLarge,
	IconBaselineDensitySmall,
	IconX,
} from "@tabler/icons-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { FunctionReturnType } from "convex/server";
import { usePaginatedQuery, useQuery } from "convex-helpers/react/cache";
import { useState } from "react";
import { ThreadList, ThreadView } from "#/components/email/email-reader.tsx";
import { Button } from "#/components/ui/button.tsx";
import { ScrollArea } from "#/components/ui/scroll-area.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { createAuthenticatedConvexHttpClient } from "#/integrations/convex/server.ts";
import { cn } from "#/lib/utils.ts";

const PAGE_SIZE = 30;

export type EmailReaderView = "inbox" | "archive";
export type EmailReaderSearch = {
	inbox?: string;
	thread?: string;
};

type EmailReaderPageData = {
	createOptions: FunctionReturnType<typeof api.case.reader.getCreateOptions>;
	inboxes: FunctionReturnType<typeof api.email.reader.listInboxes>;
	selectedThread: FunctionReturnType<typeof api.email.reader.getThread>;
	selectedThreadId?: string;
	threads: FunctionReturnType<typeof api.email.reader.listThreads>;
};

export function validateEmailReaderSearch(
	search: Record<string, unknown>,
): EmailReaderSearch {
	return {
		inbox: typeof search.inbox === "string" ? search.inbox : undefined,
		thread: typeof search.thread === "string" ? search.thread : undefined,
	};
}

function getThreadListArgs(view: EmailReaderView, inboxId?: string) {
	return inboxId ? { inboxId, view } : { view };
}

export const preloadEmailReaderPage = createServerFn({ method: "GET" })
	.validator(
		(input: {
			view: EmailReaderView;
			selectedInboxId?: string;
			selectedThreadId?: string;
		}) => input,
	)
	.handler(async ({ data }): Promise<EmailReaderPageData> => {
		const client = await createAuthenticatedConvexHttpClient();
		const [threads, selectedThread, createOptions, inboxes] = await Promise.all(
			[
				client.query(api.email.reader.listThreads, {
					paginationOpts: { cursor: null, numItems: PAGE_SIZE },
					...getThreadListArgs(data.view, data.selectedInboxId),
				}),
				data.selectedThreadId
					? client.query(api.email.reader.getThread, {
							threadId: data.selectedThreadId,
						})
					: null,
				client.query(api.case.reader.getCreateOptions, {}),
				data.view === "archive"
					? client.query(api.email.reader.listInboxes, {})
					: Promise.resolve([]),
			],
		);

		return {
			createOptions,
			inboxes,
			selectedThread,
			selectedThreadId: data.selectedThreadId,
			threads,
		};
	});

export function EmailReaderPage({
	view,
	search,
	prefetched,
}: {
	view: EmailReaderView;
	search: EmailReaderSearch;
	prefetched: EmailReaderPageData;
}) {
	const { inbox: selectedInboxId, thread: selectedThreadId } = search;
	const navigate = useNavigate();
	const [isCompact, setIsCompact] = useState(false);
	const route =
		view === "archive" ? "/settings/organization/email/archived" : "/email";
	const listSearch = selectedInboxId ? { inbox: selectedInboxId } : {};
	const {
		results: liveThreads,
		status: liveThreadStatus,
		loadMore,
	} = usePaginatedQuery(
		api.email.reader.listThreads,
		getThreadListArgs(view, selectedInboxId),
		{ initialNumItems: PAGE_SIZE },
	);
	const liveSelectedThread = useQuery(
		api.email.reader.getThread,
		selectedThreadId ? { threadId: selectedThreadId } : "skip",
	);
	const selectedThread =
		liveSelectedThread === undefined &&
		selectedThreadId === prefetched.selectedThreadId
			? prefetched.selectedThread
			: liveSelectedThread;
	const liveCreateOptions = useQuery(api.case.reader.getCreateOptions, {});
	const createOptions = liveCreateOptions ?? prefetched.createOptions;
	const liveInboxes = useQuery(
		api.email.reader.listInboxes,
		view === "archive" ? {} : "skip",
	);
	const inboxes = liveInboxes ?? prefetched.inboxes;
	const prefetchedThreads =
		liveThreadStatus === "LoadingFirstPage" ? prefetched.threads : null;
	const threads = prefetchedThreads ? prefetchedThreads.page : liveThreads;
	const threadStatus = prefetchedThreads
		? prefetchedThreads.isDone
			? "Exhausted"
			: "CanLoadMore"
		: liveThreadStatus;

	function navigateToList(inboxId?: string) {
		void navigate({
			to: route,
			search: inboxId ? { inbox: inboxId } : {},
		});
	}

	return (
		<div
			className={cn(
				"grid h-full min-h-0 grid-cols-1 overflow-hidden",
				selectedThreadId &&
					"md:grid-cols-[22rem_minmax(0,1fr)] xl:grid-cols-[25rem_minmax(0,1fr)]",
			)}
		>
			<section
				className={cn(
					"min-h-0 overflow-hidden bg-background",
					selectedThreadId && "hidden md:block md:border-r",
				)}
			>
				<div className="relative flex h-full min-h-0 flex-col">
					{view === "archive" && (
						<InboxFilter
							inboxes={inboxes}
							selectedInboxId={selectedInboxId}
							onChange={(inboxId) => navigateToList(inboxId)}
						/>
					)}
					<ScrollArea
						className="min-h-0 flex-1"
						viewportProps={{ className: "overscroll-none" }}
					>
						<ThreadList
							items={threads}
							variant={view}
							selectedInboxId={selectedInboxId}
							selectedThreadId={selectedThreadId}
							status={threadStatus}
							loadMore={() => {
								if (liveThreadStatus !== "LoadingFirstPage") {
									loadMore(PAGE_SIZE);
								}
							}}
							compact={isCompact}
						/>
					</ScrollArea>
					<DensityButton compact={isCompact} onChange={setIsCompact} />
				</div>
			</section>

			<section
				className={cn(
					"min-h-0 min-w-0 overflow-hidden bg-background",
					!selectedThreadId && "hidden",
				)}
			>
				<div className="flex h-full min-h-0 flex-col">
					<div className="flex h-12 shrink-0 items-center border-b px-3 md:hidden">
						<Button
							nativeButton={false}
							variant="ghost"
							size="sm"
							render={<Link to={route} search={listSearch} />}
						>
							<IconArrowLeft />
							{view === "archive" ? "Back to archive" : "Back to inbox"}
						</Button>
					</div>
					<div className="min-h-0 flex-1">
						<ThreadView
							thread={selectedThread}
							createOptions={createOptions}
							variant={view}
							onMoved={() => navigateToList(selectedInboxId)}
							closeButton={
								<Button
									nativeButton={false}
									variant="ghost"
									size="icon-sm"
									render={
										<Link
											to={route}
											search={listSearch}
											aria-label="Close email"
											title="Close email"
										/>
									}
								>
									<IconX />
								</Button>
							}
						/>
					</div>
				</div>
			</section>
		</div>
	);
}

function InboxFilter({
	inboxes,
	selectedInboxId,
	onChange,
}: {
	inboxes: FunctionReturnType<typeof api.email.reader.listInboxes>;
	selectedInboxId?: string;
	onChange: (inboxId?: string) => void;
}) {
	const options = [
		{ value: "all", label: "All inboxes" },
		...inboxes.map((inbox) => ({
			value: inbox._id,
			label: inbox.displayName,
		})),
	];

	return (
		<div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
			<span className="text-sm font-medium">Inbox</span>
			<Select
				items={options}
				value={selectedInboxId ?? "all"}
				onValueChange={(inboxId) => {
					if (inboxId) onChange(inboxId === "all" ? undefined : inboxId);
				}}
			>
				<SelectTrigger size="sm" className="min-w-40 max-w-56">
					<SelectValue />
				</SelectTrigger>
				<SelectContent align="end">
					{options.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

function DensityButton({
	compact,
	onChange,
}: {
	compact: boolean;
	onChange: (compact: boolean) => void;
}) {
	const label = compact
		? "Use comfortable email list"
		: "Use compact email list";

	return (
		<Button
			type="button"
			size="icon-lg"
			className="absolute right-4 bottom-4 z-20 shadow-lg"
			aria-label={label}
			aria-pressed={compact}
			title={label}
			onClick={() => onChange(!compact)}
		>
			{compact ? <IconBaselineDensityLarge /> : <IconBaselineDensitySmall />}
		</Button>
	);
}
