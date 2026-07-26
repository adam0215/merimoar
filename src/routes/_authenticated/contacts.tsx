import { IconArrowLeft } from "@tabler/icons-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { usePaginatedQuery, useQuery } from "convex-helpers/react/cache";
import {
	ContactList,
	ContactView,
} from "#/components/contact/contact-browser.tsx";
import { Button } from "#/components/ui/button.tsx";
import { ScrollArea } from "#/components/ui/scroll-area.tsx";
import { createAuthenticatedConvexHttpClient } from "#/integrations/convex/server.ts";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";

type ContactsSearch = {
	contact?: string;
};

const preloadInitialContactPage = createServerFn({ method: "GET" })
	.validator((input: { selectedContactId?: string }) => input)
	.handler(async ({ data }) => {
		const client = await createAuthenticatedConvexHttpClient();
		const [contacts, selectedContact] = await Promise.all([
			client.query(api.contact.reader.list, {
				paginationOpts: {
					cursor: null,
					numItems: 30,
				},
			}),
			data.selectedContactId
				? client.query(api.contact.reader.get, {
						contactId: data.selectedContactId,
					})
				: null,
		]);
		const messages = selectedContact
			? await client.query(api.contact.reader.listMessages, {
					contactId: selectedContact._id,
					paginationOpts: {
						cursor: null,
						numItems: 20,
					},
				})
			: null;

		return {
			contacts,
			messages,
			selectedContact,
			selectedContactId: data.selectedContactId,
		};
	});

export const Route = createFileRoute("/_authenticated/contacts")({
	validateSearch: (search: Record<string, unknown>): ContactsSearch => ({
		contact: typeof search.contact === "string" ? search.contact : undefined,
	}),
	loaderDeps: ({ search }) => ({ selectedContactId: search.contact }),
	loader: ({ deps }) => preloadInitialContactPage({ data: deps }),
	component: ContactsPage,
});

function ContactsPage() {
	const prefetched = Route.useLoaderData();
	const { contact: selectedContactId } = Route.useSearch();
	const {
		results: liveContacts,
		status: liveContactStatus,
		loadMore: loadMoreContacts,
	} = usePaginatedQuery(api.contact.reader.list, {}, { initialNumItems: 30 });
	const canUsePrefetchedContacts = liveContactStatus === "LoadingFirstPage";
	const contacts = canUsePrefetchedContacts
		? prefetched.contacts.page
		: liveContacts;
	const contactStatus = canUsePrefetchedContacts
		? prefetched.contacts.isDone
			? "Exhausted"
			: "CanLoadMore"
		: liveContactStatus;
	const liveSelectedContact = useQuery(
		api.contact.reader.get,
		selectedContactId
			? {
					contactId: selectedContactId,
				}
			: "skip",
	);
	const canUsePrefetchedContact =
		liveSelectedContact === undefined &&
		selectedContactId === prefetched.selectedContactId;
	const selectedContact = canUsePrefetchedContact
		? prefetched.selectedContact
		: liveSelectedContact;
	const {
		results: liveMessages,
		status: liveMessageStatus,
		loadMore: loadMoreMessages,
	} = usePaginatedQuery(
		api.contact.reader.listMessages,
		selectedContact
			? {
					contactId: selectedContact._id,
				}
			: "skip",
		{ initialNumItems: 20 },
	);
	const canUsePrefetchedMessages =
		liveMessageStatus === "LoadingFirstPage" &&
		selectedContactId === prefetched.selectedContactId &&
		prefetched.messages !== null;
	const messages = canUsePrefetchedMessages
		? prefetched.messages.page
		: liveMessages;
	const messageStatus = canUsePrefetchedMessages
		? prefetched.messages.isDone
			? "Exhausted"
			: "CanLoadMore"
		: liveMessageStatus;

	return (
		<div className="grid h-full min-h-0 overflow-hidden md:grid-cols-[22rem_minmax(0,1fr)] xl:grid-cols-[25rem_minmax(0,1fr)]">
			<section
				className={cn(
					"min-h-0 overflow-hidden border-r bg-background",
					selectedContactId && "hidden md:block",
				)}
			>
				<ScrollArea className="h-full" viewportClassName="overscroll-none">
					<ContactList
						contacts={contacts}
						selectedContactId={selectedContactId}
						status={contactStatus}
						loadMore={() => {
							if (liveContactStatus !== "LoadingFirstPage") {
								loadMoreContacts(30);
							}
						}}
					/>
				</ScrollArea>
			</section>

			<section
				className={cn(
					"min-h-0 min-w-0 overflow-hidden bg-background",
					!selectedContactId && "hidden md:block",
				)}
			>
				<div className="flex h-full min-h-0 flex-col">
					<div className="flex h-12 shrink-0 items-center border-b px-3 md:hidden">
						<Button asChild variant="ghost" size="sm">
							<Link to="/contacts" search={{}}>
								<IconArrowLeft />
								Back to contacts
							</Link>
						</Button>
					</div>
					<div className="min-h-0 flex-1">
						<ContactView
							contact={selectedContact}
							contactWasSelected={Boolean(selectedContactId)}
							messages={messages}
							messageStatus={messageStatus}
							loadMoreMessages={() => {
								if (liveMessageStatus !== "LoadingFirstPage") {
									loadMoreMessages(20);
								}
							}}
						/>
					</div>
				</div>
			</section>
		</div>
	);
}
