import {
	IconArrowLeft,
	IconBaselineDensityLarge,
	IconBaselineDensitySmall,
} from "@tabler/icons-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex-helpers/react/cache";
import { useState } from "react";
import { ThreadList, ThreadView } from "#/components/email/email-reader.tsx";
import { Button } from "#/components/ui/button.tsx";
import { ScrollArea } from "#/components/ui/scroll-area.tsx";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";

type EmailSearch = {
	thread?: string;
};

export const Route = createFileRoute("/_authenticated/email")({
	validateSearch: (search: Record<string, unknown>): EmailSearch => ({
		thread: typeof search.thread === "string" ? search.thread : undefined,
	}),
	component: EmailPage,
});

function EmailPage() {
	const { thread: selectedThreadId } = Route.useSearch();
	const [isCompact, setIsCompact] = useState(false);
	const connections = useQuery(api.email.reader.listConnections, {});
	const activeConnection = connections?.find(
		(connection) => connection.status === "active",
	);
	const {
		results: threads,
		status,
		loadMore,
	} = usePaginatedQuery(
		api.email.reader.listThreads,
		activeConnection ? { connectionId: activeConnection._id } : "skip",
		{ initialNumItems: 30 },
	);
	const selectedThread = useQuery(
		api.email.reader.getThread,
		selectedThreadId ? { threadId: selectedThreadId } : "skip",
	);
	const threadStatus = activeConnection ? status : "Exhausted";

	return (
		<div className="grid h-full min-h-0 overflow-hidden md:grid-cols-[22rem_minmax(0,1fr)] xl:grid-cols-[25rem_minmax(0,1fr)]">
			<section
				className={cn(
					"min-h-0 overflow-hidden border-r bg-background",
					selectedThreadId && "hidden md:block",
				)}
			>
				<div className="relative h-full">
					<ScrollArea className="h-full" viewportClassName="overscroll-none">
						<ThreadList
							items={threads}
							selectedThreadId={selectedThreadId}
							status={threadStatus}
							loadMore={() => loadMore(30)}
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
						<Button asChild variant="ghost" size="sm">
							<Link to="/email" search={{}}>
								<IconArrowLeft />
								Back to inbox
							</Link>
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
