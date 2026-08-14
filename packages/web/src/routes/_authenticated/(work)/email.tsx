import { createFileRoute } from "@tanstack/react-router";
import {
	EmailReaderPage,
	preloadEmailReaderPage,
	validateEmailReaderSearch,
} from "#/components/email/email-reader-page.tsx";

export const Route = createFileRoute("/_authenticated/(work)/email")({
	validateSearch: validateEmailReaderSearch,
	loaderDeps: ({ search }) => ({
		selectedInboxId: search.inbox,
		selectedThreadId: search.thread,
	}),
	loader: ({ deps }) =>
		preloadEmailReaderPage({ data: { ...deps, view: "inbox" } }),
	component: EmailPage,
});

function EmailPage() {
	return (
		<EmailReaderPage
			view="inbox"
			search={Route.useSearch()}
			prefetched={Route.useLoaderData()}
		/>
	);
}
