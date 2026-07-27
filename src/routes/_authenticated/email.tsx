import {
	IconArrowLeft,
	IconBaselineDensityLarge,
	IconBaselineDensitySmall,
} from "@tabler/icons-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { usePaginatedQuery, useQuery } from "convex-helpers/react/cache";
import { useState } from "react";
import { ThreadList, ThreadView } from "#/components/email/email-reader.tsx";
import { Button } from "#/components/ui/button.tsx";
import { ScrollArea } from "#/components/ui/scroll-area.tsx";
import { createAuthenticatedConvexHttpClient } from "#/integrations/convex/server.ts";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";

type EmailSearch = {
	thread?: string;
};

const preloadInitialEmailPage = createServerFn({ method: "GET" })
	.validator((input: { selectedThreadId?: string }) => input)
	.handler(async ({ data }) => {
		const client = await createAuthenticatedConvexHttpClient();
		const connections = await client.query(
			api.email.reader.listConnections,
			{},
		);
		const activeConnection = connections.find(
			(connection) => connection.status === "active",
		);
		const [threads, selectedThread] = await Promise.all([
			activeConnection
				? client.query(api.email.reader.listThreads, {
						connectionId: activeConnection._id,
						paginationOpts: {
							cursor: null,
							numItems: 30,
						},
					})
				: null,
			data.selectedThreadId
				? client.query(api.email.reader.getThread, {
						threadId: data.selectedThreadId,
					})
				: null,
		]);

		return {
			activeConnectionId: activeConnection?._id,
			connections,
			selectedThread,
			selectedThreadId: data.selectedThreadId,
			threads,
		};
	});

export const Route = createFileRoute("/_authenticated/email")({
	validateSearch: (search: Record<string, unknown>): EmailSearch => ({
		thread: typeof search.thread === "string" ? search.thread : undefined,
	}),
	loaderDeps: ({ search }) => ({ selectedThreadId: search.thread }),
	loader: ({ deps }) => preloadInitialEmailPage({ data: deps }),
	component: EmailPage,
});

function EmailPage() {
	const prefetched = Route.useLoaderData();
	const { thread: selectedThreadId } = Route.useSearch();
	const [isCompact, setIsCompact] = useState(false);
	const liveConnections = useQuery(api.email.reader.listConnections, {});
	const connections = liveConnections ?? prefetched.connections;
	const activeConnection = connections?.find(
		(connection) => connection.status === "active",
	);
	const {
		results: liveThreads,
		status: liveThreadStatus,
		loadMore,
	} = usePaginatedQuery(
		api.email.reader.listThreads,
		activeConnection ? { connectionId: activeConnection._id } : "skip",
		{ initialNumItems: 30 },
	);
	const liveSelectedThread = useQuery(
		api.email.reader.getThread,
		selectedThreadId ? { threadId: selectedThreadId } : "skip",
	);
	const canUsePrefetchedSelectedThread =
		liveSelectedThread === undefined &&
		selectedThreadId === prefetched.selectedThreadId;
	const selectedThread = canUsePrefetchedSelectedThread
		? prefetched.selectedThread
		: liveSelectedThread;
	const prefetchedThreads =
		liveThreadStatus === "LoadingFirstPage" &&
		activeConnection?._id === prefetched.activeConnectionId
			? prefetched.threads
			: null;
	const threads = prefetchedThreads ? prefetchedThreads.page : liveThreads;
	const threadStatus = activeConnection
		? prefetchedThreads
			? prefetchedThreads.isDone
				? "Exhausted"
				: "CanLoadMore"
			: liveThreadStatus
		: "Exhausted";

	return (
		<div className="grid h-full min-h-0 overflow-hidden md:grid-cols-[22rem_minmax(0,1fr)] xl:grid-cols-[25rem_minmax(0,1fr)]">
			<section
				className={cn(
					"min-h-0 overflow-hidden border-r bg-background",
					selectedThreadId && "hidden md:block",
				)}
			>
				<div className="relative h-full">
					<ScrollArea
						className="h-full"
						viewportProps={{ className: "overscroll-none" }}
					>
						<ThreadList
							items={threads}
							selectedThreadId={selectedThreadId}
							status={threadStatus}
							loadMore={() => {
								if (liveThreadStatus !== "LoadingFirstPage") {
									loadMore(30);
								}
							}}
							compact={isCompact}
						/>
					</ScrollArea>
					<Button
						type="button"
						size="icon-lg"
						className="absolute right-4 bottom-4 z-20 shadow-lg"
						aria-label={
							isCompact
								? "Use comfortable email list"
								: "Use compact email list"
						}
						aria-pressed={isCompact}
						title={
							isCompact
								? "Use comfortable email list"
								: "Use compact email list"
						}
						onClick={() => setIsCompact((compact) => !compact)}
					>
						{isCompact ? (
							<IconBaselineDensityLarge />
						) : (
							<IconBaselineDensitySmall />
						)}
					</Button>
				</div>
			</section>

			<section
				className={cn(
					"min-h-0 min-w-0 overflow-hidden bg-background",
					!selectedThreadId && "hidden md:block",
				)}
			>
				<div className="flex h-full min-h-0 flex-col">
					<div className="flex h-12 shrink-0 items-center border-b px-3 md:hidden">
						<Button
							nativeButton={false}
							variant="ghost"
							size="sm"
							render={<Link to="/email" search={{}} />}
						>
							<IconArrowLeft />
							Back to inbox
						</Button>
					</div>
					<div className="min-h-0 flex-1">
						<ThreadView
							thread={selectedThread}
							isLoading={Boolean(
								selectedThreadId && selectedThread === undefined,
							)}
						/>
					</div>
				</div>
			</section>
		</div>
	);
}
