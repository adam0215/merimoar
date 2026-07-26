import { IconInbox, IconLoader2, IconMailOpened } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Button } from "#/components/ui/button.tsx";
import { ScrollArea } from "#/components/ui/scroll-area.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { cn } from "#/lib/utils.ts";
import type { Id } from "../../../convex/_generated/dataModel";

type Participant = {
	name?: string;
	address: string;
};

type ThreadListItem = {
	thread: {
		_id: Id<"emailThreads">;
		lastActivityAt: number;
	};
	latestMessage: {
		from: Participant;
		subject: string;
		textBody: string;
		receivedAt: number;
	} | null;
};

type ThreadDetails = {
	connection: {
		address: string;
		displayName: string;
	};
	messages: Array<{
		_id: Id<"emailMessages">;
		from: Participant;
		to: Participant[];
		cc: Participant[];
		subject: string;
		textBody: string;
		sentAt: number;
	}>;
};

const SKELETON_ROWS = [
	"skeleton-a",
	"skeleton-b",
	"skeleton-c",
	"skeleton-d",
	"skeleton-e",
	"skeleton-f",
	"skeleton-g",
];

function participantLabel(participant: Participant) {
	return participant.name || participant.address;
}

function initials(participant: Participant) {
	const label = participantLabel(participant);
	return label
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0])
		.join("")
		.toUpperCase();
}

function formatListDate(timestamp: number) {
	const date = new Date(timestamp);
	const today = new Date();
	const sameYear = date.getFullYear() === today.getFullYear();

	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		...(sameYear ? {} : { year: "numeric" }),
	}).format(date);
}

function formatMessageDate(timestamp: number) {
	return new Intl.DateTimeFormat("en-US", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(timestamp));
}

export function ThreadList({
	items,
	selectedThreadId,
	status,
	loadMore,
}: {
	items: ThreadListItem[];
	selectedThreadId?: string;
	status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
	loadMore: () => void;
}) {
	if (status === "LoadingFirstPage") {
		return (
			<div className="space-y-1 p-2">
				{SKELETON_ROWS.map((row) => (
					<div key={row} className="flex gap-3 rounded-xl px-3 py-4">
						<Skeleton className="size-9 rounded-full" />
						<div className="flex-1 space-y-2">
							<Skeleton className="h-3 w-2/5" />
							<Skeleton className="h-3 w-4/5" />
							<Skeleton className="h-3 w-full" />
						</div>
					</div>
				))}
			</div>
		);
	}

	if (items.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center px-8 text-center">
				<span className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-muted">
					<IconInbox className="size-5 text-muted-foreground" />
				</span>
				<h2 className="font-medium">No inbound email yet</h2>
				<p className="mt-1 max-w-64 text-sm text-muted-foreground">
					New messages will appear here as soon as they reach an active
					connection.
				</p>
			</div>
		);
	}

	return (
		<div className="p-2">
			{items.map(({ thread, latestMessage }) => {
				if (!latestMessage) {
					return null;
				}
				const isActive = thread._id === selectedThreadId;
				const preview = latestMessage.textBody.replace(/\s+/g, " ").trim();

				return (
					<Link
						key={thread._id}
						to="/email"
						search={{ thread: thread._id }}
						className={cn(
							"mb-1 flex gap-3 rounded-xl px-3 py-3.5 text-foreground no-underline outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
							isActive && "bg-muted",
						)}
					>
						<Avatar className="mt-0.5">
							<AvatarFallback>{initials(latestMessage.from)}</AvatarFallback>
						</Avatar>
						<div className="min-w-0 flex-1">
							<div className="flex items-baseline gap-2">
								<p className="min-w-0 flex-1 truncate text-sm font-medium">
									{participantLabel(latestMessage.from)}
								</p>
								<time className="shrink-0 text-xs text-muted-foreground">
									{formatListDate(latestMessage.receivedAt)}
								</time>
							</div>
							<p className="mt-0.5 truncate text-sm">
								{latestMessage.subject || "(No subject)"}
							</p>
							<p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
								{preview}
							</p>
						</div>
					</Link>
				);
			})}

			{status !== "Exhausted" && (
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
	);
}

export function ThreadView({
	thread,
	isLoading,
}: {
	thread: ThreadDetails | null | undefined;
	isLoading: boolean;
}) {
	if (isLoading) {
		return (
			<div className="mx-auto max-w-3xl space-y-8 p-6 md:p-10">
				<div className="space-y-3">
					<Skeleton className="h-7 w-3/5" />
					<Skeleton className="h-4 w-2/5" />
				</div>
				<Skeleton className="h-64 w-full rounded-2xl" />
			</div>
		);
	}

	if (!thread) {
		return (
			<div className="flex h-full flex-col items-center justify-center px-8 text-center">
				<span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-muted">
					<IconMailOpened className="size-5 text-muted-foreground" />
				</span>
				<h2 className="font-medium">Select an email</h2>
				<p className="mt-1 max-w-72 text-sm text-muted-foreground">
					Choose a message from the list to read the complete conversation.
				</p>
			</div>
		);
	}

	const subject =
		thread.messages[thread.messages.length - 1]?.subject || "(No subject)";

	return (
		<ScrollArea className="h-full">
			<div className="mx-auto max-w-3xl px-5 py-7 md:px-10 md:py-9">
				<div className="mb-7">
					<p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
						{thread.connection.displayName}
					</p>
					<h1 className="text-balance text-2xl font-semibold tracking-tight">
						{subject}
					</h1>
				</div>

				<div className="space-y-5">
					{thread.messages.map((message, index) => (
						<article key={message._id} className="rounded-2xl border bg-card">
							<header className="flex items-start gap-3 p-5">
								<Avatar size="lg">
									<AvatarFallback>{initials(message.from)}</AvatarFallback>
								</Avatar>
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
										<div className="min-w-0">
											<p className="truncate text-sm font-medium">
												{participantLabel(message.from)}
											</p>
											<p className="truncate text-xs text-muted-foreground">
												{message.from.address}
											</p>
										</div>
										<time className="text-xs text-muted-foreground">
											{formatMessageDate(message.sentAt)}
										</time>
									</div>
									<p className="mt-2 text-xs text-muted-foreground">
										To {message.to.map(participantLabel).join(", ")}
										{message.cc.length > 0 &&
											`, cc ${message.cc.map(participantLabel).join(", ")}`}
									</p>
								</div>
							</header>
							<Separator />
							<div className="whitespace-pre-wrap px-5 py-6 text-sm leading-7 text-foreground/90">
								{message.textBody}
							</div>
							{index < thread.messages.length - 1 && (
								<p className="sr-only">Earlier message</p>
							)}
						</article>
					))}
				</div>
			</div>
		</ScrollArea>
	);
}
