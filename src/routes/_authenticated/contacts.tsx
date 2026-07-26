import { IconArrowLeft } from "@tabler/icons-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex-helpers/react/cache";
import {
	ContactList,
	ContactView,
} from "#/components/contact/contact-browser.tsx";
import { Button } from "#/components/ui/button.tsx";
import { ScrollArea } from "#/components/ui/scroll-area.tsx";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";

type ContactsSearch = {
	contact?: string;
};

export const Route = createFileRoute("/_authenticated/contacts")({
	validateSearch: (search: Record<string, unknown>): ContactsSearch => ({
		contact: typeof search.contact === "string" ? search.contact : undefined,
	}),
	component: ContactsPage,
});

function ContactsPage() {
	const { contact: selectedContactId } = Route.useSearch();
	const {
		results: contacts,
		status: contactStatus,
		loadMore: loadMoreContacts,
	} = usePaginatedQuery(api.contact.reader.list, {}, { initialNumItems: 30 });
	const selectedContact = useQuery(
		api.contact.reader.get,
		selectedContactId
			? {
					contactId: selectedContactId,
				}
			: "skip",
	);
	const {
		results: messages,
		status: messageStatus,
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
						loadMore={() => loadMoreContacts(30)}
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
							loadMoreMessages={() => loadMoreMessages(20)}
						/>
					</div>
				</div>
			</section>
		</div>
	);
}
