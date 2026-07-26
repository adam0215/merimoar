import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "convex-helpers/react/cache";
import { EntitySettings } from "#/components/entity/entity-settings.tsx";
import { createAuthenticatedConvexHttpClient } from "#/integrations/convex/server.ts";
import { api } from "../../../../../convex/_generated/api";

type EntitySettingsSearch = {
	type?: string;
};

const preloadEntitySettings = createServerFn({ method: "GET" })
	.validator((input: { selectedTypeId?: string }) => input)
	.handler(async ({ data }) => {
		const client = await createAuthenticatedConvexHttpClient();
		const [entityTypes, detail] = await Promise.all([
			client.query(api.entity.reader.listTypes, {}),
			data.selectedTypeId
				? client.query(api.entity.reader.getType, {
						entityTypeId: data.selectedTypeId,
					})
				: null,
		]);

		return {
			detail,
			entityTypes,
			selectedTypeId: data.selectedTypeId,
		};
	});

export const Route = createFileRoute(
	"/_authenticated/settings/organization/entities",
)({
	validateSearch: (search: Record<string, unknown>): EntitySettingsSearch => ({
		type: typeof search.type === "string" ? search.type : undefined,
	}),
	loaderDeps: ({ search }) => ({ selectedTypeId: search.type }),
	loader: ({ deps }) => preloadEntitySettings({ data: deps }),
	component: OrganizationEntitySettings,
});

function OrganizationEntitySettings() {
	const prefetched = Route.useLoaderData();
	const { type: selectedTypeId } = Route.useSearch();
	const navigate = useNavigate({
		from: "/settings/organization/entities",
	});
	const liveEntityTypes = useQuery(api.entity.reader.listTypes, {});
	const entityTypes = liveEntityTypes ?? prefetched.entityTypes;
	const liveDetail = useQuery(
		api.entity.reader.getType,
		selectedTypeId ? { entityTypeId: selectedTypeId } : "skip",
	);
	const canUsePrefetchedDetail =
		liveDetail === undefined && selectedTypeId === prefetched.selectedTypeId;
	const detail = canUsePrefetchedDetail ? prefetched.detail : liveDetail;

	return (
		<EntitySettings
			entityTypes={entityTypes}
			selectedTypeId={selectedTypeId}
			detail={detail}
			onTypeCreated={(entityTypeId) =>
				navigate({ search: { type: entityTypeId } })
			}
		/>
	);
}
