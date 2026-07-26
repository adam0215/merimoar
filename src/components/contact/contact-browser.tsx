import { IconAddressBook, IconInbox, IconLoader2 } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { RetroDither } from "#/components/canvasui/RetroDither.tsx";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { coverImageForId } from "#/lib/cover-image.ts";
import { cn } from "#/lib/utils.ts";
import type { api } from "../../../convex/_generated/api";

type Contact = NonNullable<FunctionReturnType<typeof api.contact.reader.get>>;
type ContactMessage = FunctionReturnType<
	typeof api.contact.reader.listMessages
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

function formatListDate(timestamp: number) {
	const date = new Date(timestamp);
	const today = new Date();

	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		...(date.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
	}).format(date);
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
					<Link
						key={contact._id}
						to="/contacts"
						search={{ contact: contact._id }}
						className={cn(
							"mb-1 flex gap-3 rounded-xl px-3 py-3.5 text-foreground no-underline outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
							isActive && "bg-muted",
						)}
					>
						<Avatar className="mt-0.5">
							<AvatarFallback className={cn(isActive && "bg-background")}>
								{initials(contact)}
							</AvatarFallback>
						</Avatar>
						<div className="min-w-0 flex-1">
							<div className="flex items-baseline gap-2">
								<p className="min-w-0 flex-1 truncate text-sm font-medium">
									{contactLabel(contact)}
								</p>
								<time className="shrink-0 text-xs text-muted-foreground">
									{formatListDate(contact.lastSeenAt)}
								</time>
							</div>
							{contact.name && (
								<p className="mt-0.5 truncate text-xs text-muted-foreground">
									{contact.address}
								</p>
							)}
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

export function ContactView({
	contact,
	contactWasSelected,
	messages,
	messageStatus,
	loadMoreMessages,
}: {
	contact: Contact | null | undefined;
	contactWasSelected: boolean;
	messages: ContactMessage[];
	messageStatus: PaginationStatus;
	loadMoreMessages: () => void;
}) {
	if (contactWasSelected && contact === undefined) {
		return (
			<div className="mx-auto max-w-4xl p-6">
				<div className="h-28 rounded-xl bg-accent/40" />
				<div className="-mt-14 grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-x-4 lg:grid-cols-[7rem_minmax(0,1fr)_auto] lg:px-6">
					<Skeleton className="row-span-2 size-28 shrink-0 rounded-full border-4 border-background" />
					<Skeleton className="col-start-2 row-start-1 mt-16 h-5 w-40" />
					<div className="col-span-2 row-start-3 mt-3 flex gap-2 lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:mt-16 lg:justify-self-end lg:self-center">
						<Skeleton className="h-5 w-28 rounded-4xl" />
						<Skeleton className="h-5 w-28 rounded-4xl" />
					</div>
					<Skeleton className="col-start-2 row-start-2 h-3 w-56 lg:col-end-4" />
				</div>
			</div>
		);
	}

	if (!contact) {
		return (
			<div className="flex h-full flex-col items-center justify-center px-8 text-center">
				<IconAddressBook className="mb-4 size-6 text-muted-foreground/50" />
				<h2 className="font-medium">
					{contactWasSelected ? "Contact not found" : "Select a contact"}
				</h2>
				<p className="mt-1 max-w-72 text-sm text-muted-foreground">
					{contactWasSelected
						? "This contact is unavailable in the current organization."
						: "Choose a contact to see their email activity."}
				</p>
			</div>
		);
	}

	return (
		<div className="h-full overflow-y-auto">
			<div className="mx-auto w-full max-w-4xl p-6">
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
				<header className="-mt-14 grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-x-4 lg:grid-cols-[7rem_minmax(0,1fr)_auto] lg:px-6">
					<Avatar className="row-span-2 size-28 border-4 border-background">
						<AvatarFallback className="text-3xl">
							{initials(contact)}
						</AvatarFallback>
					</Avatar>
					<h1 className="col-start-2 row-start-1 mt-16 truncate text-xl font-semibold tracking-tight">
						{contactLabel(contact)}
					</h1>
					<div className="col-span-2 row-start-3 mt-3 flex shrink-0 gap-2 lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:mt-16 lg:justify-self-end lg:self-center">
						<Badge variant="secondary">
							<span>First:</span>
							<span>{formatBadgeDate(contact.firstSeenAt)}</span>
						</Badge>
						<Badge variant="secondary">
							<span>Latest:</span>
							<span>{formatBadgeDate(contact.lastSeenAt)}</span>
						</Badge>
					</div>
					{contact.name && (
						<p className="col-start-2 row-start-2 truncate text-sm text-muted-foreground lg:col-end-4">
							{contact.address}
						</p>
					)}
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
							messages.map(({ message, connection }) => {
								const preview = message.textBody.replace(/\s+/g, " ").trim();

								return (
									<Link
										key={message._id}
										to="/email"
										search={{ thread: message.threadId }}
										className="grid grid-cols-[max-content_minmax(0,1fr)_auto] items-center gap-x-2 rounded-lg px-3 py-2 text-xs text-foreground no-underline outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
									>
										<p className="max-w-28 truncate font-medium text-muted-foreground">
											{connection.displayName}
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
											{formatListDate(message.receivedAt)}
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
			</div>
		</div>
	);
}
