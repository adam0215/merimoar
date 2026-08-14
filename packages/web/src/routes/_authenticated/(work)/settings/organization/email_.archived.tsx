import { createFileRoute } from "@tanstack/react-router";
import {
	EmailReaderPage,
	preloadEmailReaderPage,
	validateEmailReaderSearch,
} from "#/components/email/email-reader-page.tsx";

export const Route = createFileRoute(
	"/_authenticated/(work)/settings/organization/email_/archived",
)({
	validateSearch: validateEmailReaderSearch,
	loaderDeps: ({ search }) => ({
		selectedInboxId: search.inbox,
		selectedThreadId: search.thread,
	}),
	loader: ({ deps }) =>
		preloadEmailReaderPage({ data: { ...deps, view: "archive" } }),
	component: ArchivedEmailPage,
});

function ArchivedEmailPage() {
	return (
		<EmailReaderPage
			view="archive"
			search={Route.useSearch()}
			prefetched={Route.useLoaderData()}
		/>
	);
}
