import type { api } from "@merimoar/convex/api";
import { CASE_STATUS_LABELS } from "@merimoar/convex/case/model";
import {
	IconAddressBook,
	IconFolder,
	IconInbox,
	IconLoader2,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { RetroDither } from "#/components/canvasui/RetroDither.tsx";
import { CaseStatusDot } from "#/components/case/case-status.tsx";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { BrowserListItem } from "#/components/ui/browser-list-item.tsx";
import { Button } from "#/components/ui/button.tsx";
import { borderedSurfaceClassName } from "#/components/ui/field-surface.ts";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { coverImageForId } from "#/lib/cover-image.ts";
import { formatShortDate } from "#/lib/date-format.ts";
import { cn } from "#/lib/utils.ts";

type Contact = NonNullable<FunctionReturnType<typeof api.contact.reader.get>>;
type ContactMessage = FunctionReturnType<
	typeof api.contact.reader.listMessages
>["page"][number];
type ContactCase = FunctionReturnType<
	typeof api.contact.reader.listCases
>["page"][number];

type PaginationStatus =
	| "LoadingFirstPage"
	| "CanLoadMore"
	| "LoadingMore"
	| "Exhausted";

const SKELETON_ROWS = [
	"contact-a",
	"contact-b",
	"contact-c",
	"contact-d",
	"contact-e",
	"contact-f",
];

function contactLabel(contact: Pick<Contact, "address" | "name">) {
	return contact.name || contact.address;
}

function initials(contact: Pick<Contact, "address" | "name">) {
	return contactLabel(contact)
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0])
		.join("")
		.toUpperCase();
}

function formatBadgeDate(timestamp: number) {
	return new Intl.DateTimeFormat(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	}).format(new Date(timestamp));
}

export function ContactList({
	contacts,
	selectedContactId,
	status,
	loadMore,
}: {
	contacts: Contact[];
	selectedContactId?: string;
	status: PaginationStatus;
	loadMore: () => void;
}) {
	if (status === "LoadingFirstPage") {
		return (
			<div className="space-y-1 p-2">
				{SKELETON_ROWS.map((row) => (
					<div key={row} className="flex gap-3 rounded-xl px-3 py-3.5">
						<Skeleton className="size-9 rounded-full" />
						<div className="flex-1 space-y-2">
							<Skeleton className="h-3 w-2/5" />
							<Skeleton className="h-3 w-4/5" />
						</div>
					</div>
				))}
			</div>
		);
	}

	if (contacts.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center px-8 text-center">
				<IconAddressBook className="mb-4 size-6 text-muted-foreground/50" />
				<h2 className="font-medium">No contacts yet</h2>
				<p className="mt-1 max-w-64 text-sm text-muted-foreground">
					People who send email to your organization will appear here.
				</p>
			</div>
		);
	}

	return (
		<div className="p-2 pb-8">
			{contacts.map((contact) => {
				const isActive = contact._id === selectedContactId;

				return (
					<BrowserListItem
						key={contact._id}
						active={isActive}
						render={<Link to="/contacts" search={{ contact: contact._id }} />}
						visual={
							<Avatar className="mt-0.5">
								<AvatarFallback className={cn(isActive && "bg-background")}>
									{initials(contact)}
								</AvatarFallback>
							</Avatar>
						}
						title={contactLabel(contact)}
						subtitle={contact.name ? contact.address : undefined}
						trailing={
							<time className="shrink-0 text-xs text-muted-foreground">
								{formatShortDate(contact.lastSeenAt)}
							</time>
						}
					/>
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

export function ContactView({
	contact,
	cases,
	caseStatus,
	loadMoreCases,
	messages,
	messageStatus,
	loadMoreMessages,
	closeButton,
}: {
	contact: Contact | null | undefined;
	cases: ContactCase[];
	caseStatus: PaginationStatus;
	loadMoreCases: () => void;
	messages: ContactMessage[];
	messageStatus: PaginationStatus;
	loadMoreMessages: () => void;
	closeButton: React.ReactNode;
}) {
	const casesWithClosedLast = [...cases].sort(
		(firstCase, secondCase) =>
			Number(firstCase.status === "closed") -
			Number(secondCase.status === "closed"),
	);

	if (contact === undefined) {
		return (
			<div className="mx-auto max-w-4xl p-6">
				<div className="h-28 rounded-xl bg-accent/40" />
				<div className="-mt-14 flex items-start gap-4 px-6">
					<Skeleton className="size-28 shrink-0 rounded-full border-4 border-background" />
					<div className="@container mt-16 min-w-0 flex-1">
						<div className="flex flex-col gap-3 @sm:grid @sm:grid-cols-[minmax(0,1fr)_auto] @sm:items-center @sm:gap-x-4 @sm:gap-y-0">
							<div className="min-w-0 @sm:contents">
								<Skeleton className="h-5 w-40 max-w-full @sm:col-start-1 @sm:row-start-1" />
								<Skeleton className="mt-2 h-3 w-56 max-w-full @sm:col-span-2 @sm:col-start-1 @sm:row-start-2 @sm:mt-0" />
							</div>
							<div className="flex max-w-full flex-wrap gap-2 @sm:col-start-2 @sm:row-start-1 @sm:justify-self-end">
								<Skeleton className="h-5 w-28 rounded-4xl" />
								<Skeleton className="h-5 w-28 rounded-4xl" />
							</div>
						</div>
					</div>
				</div>
			</div>
		);
	}

	if (!contact) {
		return (
			<div className="flex h-full flex-col items-center justify-center px-8 text-center">
				<IconAddressBook className="mb-4 size-6 text-muted-foreground/50" />
				<h2 className="font-medium">Contact not found</h2>
				<p className="mt-1 max-w-72 text-sm text-muted-foreground">
					This contact is unavailable in the current organization.
				</p>
			</div>
		);
	}

	return (
		<div className="h-full overflow-y-auto">
			<div className="mx-auto w-full max-w-4xl px-6 pt-2 pb-6">
				<div className="mb-2 flex justify-end">{closeButton}</div>
				<div className="h-28 overflow-hidden rounded-xl bg-accent/40">
					<RetroDither
						className="size-full"
						pixelSize={2}
						levels={5}
						radius={1.3}
						softness={0.55}
						contrast={0.9}
						colorize={0.05}
						baseStrength={0.4}
						strength={1}
					>
						<img
							src={coverImageForId(contact._id)}
							alt=""
							className="size-full object-cover"
						/>
					</RetroDither>
				</div>
				<header className="-mt-14 flex items-start gap-4 px-6">
					<Avatar className="size-28 shrink-0 border-4 border-background">
						<AvatarFallback className="text-3xl">
							{initials(contact)}
						</AvatarFallback>
					</Avatar>
					<div className="@container mt-16 min-w-0 flex-1">
						<div className="flex flex-col gap-3 @sm:grid @sm:grid-cols-[minmax(0,1fr)_auto] @sm:items-center @sm:gap-x-4 @sm:gap-y-0">
							<div className="min-w-0 @sm:contents">
								<h1 className="truncate text-xl font-semibold tracking-tight @sm:col-start-1 @sm:row-start-1">
									{contactLabel(contact)}
								</h1>
								{contact.name && (
									<p className="truncate text-sm text-muted-foreground @sm:col-span-2 @sm:col-start-1 @sm:row-start-2">
										{contact.address}
									</p>
								)}
							</div>
							<div className="flex max-w-full flex-wrap gap-2 @sm:col-start-2 @sm:row-start-1 @sm:justify-self-end">
								<Badge variant="secondary">
									<span>First:</span>
									<span>{formatBadgeDate(contact.firstSeenAt)}</span>
								</Badge>
								<Badge variant="secondary">
									<span>Latest:</span>
									<span>{formatBadgeDate(contact.lastSeenAt)}</span>
								</Badge>
							</div>
						</div>
					</div>
				</header>

				<section className="mt-8">
					<h2 className="text-sm font-semibold">Email activity</h2>
					<div className="mt-2 space-y-0.5">
						{messageStatus === "LoadingFirstPage" &&
							SKELETON_ROWS.slice(0, 3).map((row) => (
								<div
									key={row}
									className="grid grid-cols-[max-content_minmax(0,1fr)_4rem] items-center gap-x-2 rounded-lg px-3 py-2"
								>
									<Skeleton className="h-3 w-16" />
									<Skeleton className="h-3 w-full" />
									<Skeleton className="ml-auto h-3 w-12" />
								</div>
							))}

						{messageStatus !== "LoadingFirstPage" &&
							messages.map(({ message, inbox }) => {
								const preview = message.textBody.replace(/\s+/g, " ").trim();

								return (
									<Link
										key={message._id}
										to="/email"
										search={{ thread: message.threadId }}
										className="grid grid-cols-[max-content_minmax(0,1fr)_auto] items-center gap-x-2 rounded-lg px-3 py-2 text-xs text-foreground no-underline outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
									>
										<p className="max-w-28 truncate font-medium text-muted-foreground">
											{inbox.displayName}
										</p>
										<p className="min-w-0 truncate">
											<span className="font-semibold">
												{message.subject || "(No subject)"}
											</span>
											{preview && (
												<span className="text-muted-foreground">
													{" "}
													{preview}
												</span>
											)}
										</p>
										<time className="shrink-0 text-muted-foreground">
											{formatShortDate(message.receivedAt)}
										</time>
									</Link>
								);
							})}
					</div>

					{messageStatus !== "LoadingFirstPage" && messages.length === 0 && (
						<div className="flex flex-col items-center py-10 text-center">
							<IconInbox className="mb-3 size-5 text-muted-foreground/50" />
							<p className="text-sm font-medium">No email activity</p>
						</div>
					)}

					{messageStatus !== "Exhausted" &&
						messageStatus !== "LoadingFirstPage" && (
							<div className="flex justify-center py-4">
								<Button
									variant="ghost"
									size="sm"
									onClick={loadMoreMessages}
									disabled={messageStatus === "LoadingMore"}
								>
									{messageStatus === "LoadingMore" && (
										<IconLoader2 className="animate-spin" />
									)}
									Load more
								</Button>
							</div>
						)}
				</section>

				<section className="mt-8">
					<h2 className="text-sm font-semibold">Cases</h2>
					<div className="mt-2 space-y-2">
						{caseStatus === "LoadingFirstPage" &&
							SKELETON_ROWS.slice(0, 2).map((row) => (
								<div
									key={row}
									className={cn(
										"flex items-center gap-3 rounded-xl p-3",
										borderedSurfaceClassName,
									)}
								>
									<Skeleton className="size-9 shrink-0 rounded-full" />
									<div className="min-w-0 flex-1 space-y-2">
										<Skeleton className="h-3 w-4/5" />
										<Skeleton className="h-3 w-2/5" />
									</div>
								</div>
							))}

						{caseStatus !== "LoadingFirstPage" &&
							casesWithClosedLast.map((caseRecord) => (
								<Link
									key={caseRecord._id}
									to="/cases"
									search={{ case: caseRecord._id }}
									className={cn(
										"flex w-full min-w-0 items-center gap-3 rounded-xl p-3 text-foreground no-underline outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
										borderedSurfaceClassName,
									)}
								>
									<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
										<IconFolder className="size-4" />
									</span>
									<span className="min-w-0 flex-1">
										<span className="block truncate text-sm font-medium">
											{caseRecord.title}
										</span>
										<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
											<CaseStatusDot
												status={caseRecord.status}
												className="size-1.5"
											/>
											<span className="truncate">
												{caseRecord.reference} ·{" "}
												{CASE_STATUS_LABELS[caseRecord.status]}
											</span>
										</span>
									</span>
								</Link>
							))}
					</div>

					{caseStatus !== "LoadingFirstPage" && cases.length === 0 && (
						<div className="flex flex-col items-center py-10 text-center">
							<IconFolder className="mb-3 size-5 text-muted-foreground/50" />
							<p className="text-sm font-medium">No related cases</p>
						</div>
					)}

					{caseStatus !== "Exhausted" && caseStatus !== "LoadingFirstPage" && (
						<div className="flex justify-center py-3">
							<Button
								variant="ghost"
								size="sm"
								onClick={loadMoreCases}
								disabled={caseStatus === "LoadingMore"}
							>
								{caseStatus === "LoadingMore" && (
									<IconLoader2 className="animate-spin" />
								)}
								Load more
							</Button>
						</div>
					)}
				</section>
			</div>
		</div>
	);
}
