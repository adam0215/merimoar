import { api } from "@merimoar/convex/api";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { CaseReferencePrefixEditor } from "#/components/organization/case-reference-prefix-editor.tsx";
import { createAuthenticatedConvexHttpClient } from "#/integrations/convex/server.ts";

const preloadGeneralSettings = createServerFn({ method: "GET" }).handler(
	async () => {
		const client = await createAuthenticatedConvexHttpClient();
		return await client.query(api.organization.settings.get, {});
	},
);

export const Route = createFileRoute(
	"/_authenticated/(work)/settings/organization/general",
)({
	loader: () => preloadGeneralSettings(),
	component: OrganizationGeneralSettings,
});

function OrganizationGeneralSettings() {
	const initialSettings = Route.useLoaderData();

	return (
		<div className="h-full overflow-y-auto">
			<div className="w-full space-y-8 p-6">
				<h1 className="text-2xl font-semibold tracking-tight">General</h1>

				<section aria-labelledby="case-references-heading">
					<h2 id="case-references-heading" className="font-semibold">
						Case references
					</h2>
					<CaseReferencePrefixEditor
						initialReferenceSlug={initialSettings.referenceSlug}
					/>
				</section>
			</div>
		</div>
	);
}
