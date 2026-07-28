import {
	IconAddressBook,
	IconChevronDown,
	IconInbox,
	IconLoader2,
	IconMailOpened,
	IconMessages,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex-helpers/react/cache";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "#/components/ui/collapsible.tsx";
import { ScrollArea } from "#/components/ui/scroll-area.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip.tsx";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";
import { parseEmailReply } from "./parse-email-reply";

type ThreadListItem = FunctionReturnType<
	typeof api.email.reader.listThreads
>["page"][number];
type ThreadDetails = NonNullable<
	FunctionReturnType<typeof api.email.reader.getThread>
>;
type Message = ThreadDetails["messages"][number];
type Participant = Message["from"];

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

	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		...(sameYear ? {} : { year: "numeric" }),
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

function formatMessageDate(timestamp: number) {
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(timestamp));
}

function ThreadMessageCount({ threadId }: { threadId: string }) {
	const thread = useQuery(api.email.reader.getThread, { threadId });
	if (!thread || thread.messages.length <= 1) {
		return null;
	}

	return (
		<span
			className="inline-flex shrink-0 items-center gap-0.5 text-muted-foreground"
			aria-label={`${thread.messages.length} messages in thread`}
		>
			<IconMessages className="size-3.5" aria-hidden="true" />
			<span className="text-xs tabular-nums">{thread.messages.length}</span>
		</span>
	);
}

function findRepliedToMessage(message: Message, messages: Message[]) {
	const replyCandidates = [
		...(message.inReplyTo ? [message.inReplyTo] : []),
		...[...message.references].reverse(),
	];

	for (const internetMessageId of replyCandidates) {
		const repliedToMessage = messages.find(
			(candidate) => candidate.internetMessageId === internetMessageId,
		);
		if (repliedToMessage) {
			return repliedToMessage;
		}
	}

	return undefined;
}

export function ThreadList({
	items,
	selectedThreadId,
	status,
	loadMore,
	compact,
}: {
	items: ThreadListItem[];
	selectedThreadId?: string;
	status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
	loadMore: () => void;
	compact: boolean;
}) {
	if (status === "LoadingFirstPage") {
		return (
			<div className="space-y-1 p-2 pb-16">
				{SKELETON_ROWS.map((row) => (
					<div
						key={row}
						className={cn(
							"rounded-xl px-3",
							compact
								? "grid grid-cols-[max-content_minmax(0,1fr)_4.5rem] items-center gap-x-2 py-2"
								: "flex gap-3 py-4",
						)}
					>
						{compact ? (
							<>
								<Skeleton className="h-3 w-3/4" />
								<Skeleton className="h-3 w-full" />
								<Skeleton className="ml-auto h-3 w-12" />
							</>
						) : (
							<>
								<Skeleton className="size-9 rounded-full" />
								<div className="flex-1 space-y-2">
									<Skeleton className="h-3 w-2/5" />
									<Skeleton className="h-3 w-4/5" />
									<Skeleton className="h-3 w-full" />
								</div>
							</>
						)}
					</div>
				))}
			</div>
		);
	}

	if (items.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center px-8 text-center">
				<IconInbox className="mb-4 size-6 text-muted-foreground/50" />
				<h2 className="font-medium">No inbound email yet</h2>
				<p className="mt-1 max-w-64 text-sm text-muted-foreground">
					New messages will appear here as soon as they reach an inbox.
				</p>
			</div>
		);
	}

	return (
		<div className="p-2 pb-16">
			{items.map(({ thread, latestMessage }) => {
				if (!latestMessage) {
					return null;
				}
				const isActive = thread._id === selectedThreadId;
				const preview = parseEmailReply(latestMessage.textBody)
					.authoredText.replace(/\s+/g, " ")
					.trim();

				if (compact) {
					return (
						<Link
							key={thread._id}
							to="/email"
							search={{ thread: thread._id }}
							className={cn(
								"mb-0.5 grid grid-cols-[max-content_minmax(0,1fr)_auto] items-center gap-x-2 rounded-lg px-3 py-2 text-xs text-foreground no-underline outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
								isActive && "bg-muted",
							)}
						>
							<div className="flex min-w-0 items-center gap-2">
								<p className="truncate font-medium text-muted-foreground">
									{participantLabel(latestMessage.from)}
								</p>
								<ThreadMessageCount threadId={thread._id} />
							</div>
							<p className="min-w-0 truncate">
								<span className="font-semibold">
									{latestMessage.subject || "(No subject)"}
								</span>
								{preview && (
									<span className="text-muted-foreground"> {preview}</span>
								)}
							</p>
							<time className="shrink-0 text-muted-foreground">
								{formatListDate(latestMessage.receivedAt)}
							</time>
						</Link>
					);
				}

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
							<AvatarFallback className={cn(isActive && "bg-background")}>
								{initials(latestMessage.from)}
							</AvatarFallback>
						</Avatar>
						<div className="min-w-0 flex-1">
							<div className="flex items-baseline gap-2">
								<div className="flex min-w-0 flex-1 items-center gap-2">
									<p className="truncate text-xs font-medium text-muted-foreground">
										{participantLabel(latestMessage.from)}
									</p>
									<ThreadMessageCount threadId={thread._id} />
								</div>
								<time className="shrink-0 text-xs text-muted-foreground">
									{formatListDate(latestMessage.receivedAt)}
								</time>
							</div>
							<p className="mt-0.5 truncate text-sm font-semibold">
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
				<Skeleton className="h-64 w-full" />
			</div>
		);
	}

	if (!thread) {
		return (
			<div className="flex h-full flex-col items-center justify-center px-8 text-center">
				<IconMailOpened className="mb-4 size-6 text-muted-foreground/50" />
				<h2 className="font-medium">Select an email</h2>
				<p className="mt-1 max-w-72 text-sm text-muted-foreground">
					Choose a message from the list to read the complete conversation.
				</p>
			</div>
		);
	}

	return (
		<ScrollArea
			className="h-full"
			viewportProps={{ className: "overscroll-none" }}
		>
			<div className="w-full px-5 pt-5 pb-7 md:px-8 md:pt-7 md:pb-9">
				<div className="divide-y">
					{thread.messages.map((message) => {
						const repliedToMessage = findRepliedToMessage(
							message,
							thread.messages,
						);
						const { authoredText, quotedText } = parseEmailReply(
							message.textBody,
						);

						return (
							<article
								key={message._id}
								id={`email-message-${message._id}`}
								className="scroll-mt-6 py-8 first:pt-0 last:pb-0"
							>
								<header className="min-w-0">
									<div className="min-w-0">
										<div className="flex min-w-0 items-center justify-between gap-4">
											<div className="flex min-w-0 items-center">
												<p className="truncate text-sm font-medium">
													{participantLabel(message.from)}
												</p>
												<Tooltip>
													<TooltipTrigger
														render={
															<Button
																nativeButton={false}
																variant="ghost"
																size="icon-xs"
																className="text-muted-foreground"
																render={
																	<Link
																		to="/contacts"
																		search={{
																			contact: message.senderContactId,
																		}}
																		aria-label={`Open contact ${participantLabel(message.from)}`}
																	/>
																}
															/>
														}
													>
														<IconAddressBook />
													</TooltipTrigger>
													<TooltipContent side="top">
														Open contact
													</TooltipContent>
												</Tooltip>
											</div>
											<time className="shrink-0 text-xs text-muted-foreground">
												{formatMessageDate(message.sentAt)}
											</time>
										</div>
										<p className="truncate text-xs text-muted-foreground">
											{message.from.address}
										</p>
										<p className="text-xs">
											<span className="text-foreground">To: </span>
											<span className="break-all text-muted-foreground">
												{message.to.map(participantLabel).join(", ")}
												{message.cc.length > 0 &&
													`, cc ${message.cc.map(participantLabel).join(", ")}`}
											</span>
										</p>
									</div>
								</header>
								<h1 className="mt-5 text-balance text-xl font-semibold tracking-tight">
									{message.subject || "(No subject)"}
								</h1>
								{repliedToMessage && (
									<a
										href={`#email-message-${repliedToMessage._id}`}
										className="mt-1 inline-block text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
									>
										Reply to {participantLabel(repliedToMessage.from)} at{" "}
										{formatMessageDate(repliedToMessage.sentAt)}
									</a>
								)}
								<div className="mt-6 text-sm leading-7 text-foreground/90">
									{authoredText && (
										<div className="whitespace-pre-wrap">{authoredText}</div>
									)}
									{quotedText && (
										<Collapsible>
											<CollapsibleTrigger
												type="button"
												className="group mt-4 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
											>
												<IconChevronDown className="size-3.5 transition-transform group-data-panel-open:rotate-180" />
												<span className="group-data-panel-open:hidden">
													Show quoted text
												</span>
												<span className="hidden group-data-panel-open:inline">
													Hide quoted text
												</span>
											</CollapsibleTrigger>
											<CollapsibleContent>
												<div className="mt-3 whitespace-pre-wrap border-l pl-4 text-xs leading-6 text-muted-foreground">
													{quotedText}
												</div>
											</CollapsibleContent>
										</Collapsible>
									)}
								</div>
							</article>
						);
					})}
				</div>
			</div>
		</ScrollArea>
	);
}
