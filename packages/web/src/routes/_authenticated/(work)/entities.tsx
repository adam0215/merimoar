import { api } from "@merimoar/convex/api";
import { IconArrowLeft, IconX } from "@tabler/icons-react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { usePaginatedQuery, useQuery } from "convex-helpers/react/cache";
import { EntityList } from "#/components/entity/entity-list.tsx";
import { EntityView } from "#/components/entity/entity-view.tsx";
import { Button } from "#/components/ui/button.tsx";
import { ContextPanelLayout } from "#/components/ui/context-panel-layout.tsx";
import { createAuthenticatedConvexHttpClient } from "#/integrations/convex/server.ts";

type EntitiesSearch = {
	entity?: string;
	type?: string;
};

const PAGE_SIZE = 30;

function resolveSelectedEntityType<EntityType extends { _id: string }>(
	entityTypes: EntityType[],
	requestedTypeId?: string,
	entityTypeId?: string,
) {
	return (
		entityTypes.find((entityType) => entityType._id === requestedTypeId) ??
		entityTypes.find((entityType) => entityType._id === entityTypeId) ??
		entityTypes[0]
	);
}

const preloadInitialEntityPage = createServerFn({ method: "GET" })
	.validator((input: EntitiesSearch) => input)
	.handler(async ({ data }) => {
		const client = await createAuthenticatedConvexHttpClient();
		const [entityTypes, selectedEntity] = await Promise.all([
			client.query(api.entity.reader.listTypes, {}),
			data.entity
				? client.query(api.entity.reader.getEntity, { entityId: data.entity })
				: null,
		]);
		const selectedEntityType = resolveSelectedEntityType(
			entityTypes,
			data.type,
			selectedEntity?.entityType._id,
		);
		const entities = selectedEntityType
			? await client.query(api.entity.reader.listEntities, {
					entityTypeId: selectedEntityType._id,
					paginationOpts: { cursor: null, numItems: PAGE_SIZE },
				})
			: null;

		return {
			entities,
			entityTypes,
			selectedEntity,
			selectedEntityId: data.entity,
			selectedEntityTypeId: selectedEntityType?._id,
		};
	});

export const Route = createFileRoute("/_authenticated/(work)/entities")({
	validateSearch: (search: Record<string, unknown>): EntitiesSearch => ({
		entity: typeof search.entity === "string" ? search.entity : undefined,
		type: typeof search.type === "string" ? search.type : undefined,
	}),
	loaderDeps: ({ search }) => search,
	loader: ({ deps }) => preloadInitialEntityPage({ data: deps }),
	component: EntitiesPage,
});

function EntitiesPage() {
	const prefetched = Route.useLoaderData();
	const { entity: selectedEntityId, type: requestedEntityTypeId } =
		Route.useSearch();
	const navigate = useNavigate({ from: "/entities" });
	const liveEntityTypes = useQuery(api.entity.reader.listTypes, {});
	const entityTypes = liveEntityTypes ?? prefetched.entityTypes;
	const liveSelectedEntity = useQuery(
		api.entity.reader.getEntity,
		selectedEntityId ? { entityId: selectedEntityId } : "skip",
	);
	const selectedEntity =
		liveSelectedEntity === undefined &&
		selectedEntityId === prefetched.selectedEntityId
			? prefetched.selectedEntity
			: liveSelectedEntity;
	const selectedEntityType = resolveSelectedEntityType(
		entityTypes,
		requestedEntityTypeId,
		selectedEntity?.entityType._id,
	);
	const {
		results: liveEntities,
		status: liveEntityStatus,
		loadMore,
	} = usePaginatedQuery(
		api.entity.reader.listEntities,
		selectedEntityType ? { entityTypeId: selectedEntityType._id } : "skip",
		{ initialNumItems: PAGE_SIZE },
	);
	const prefetchedEntities =
		liveEntityStatus === "LoadingFirstPage" &&
		selectedEntityType?._id === prefetched.selectedEntityTypeId
			? prefetched.entities
			: null;
	const entities = prefetchedEntities?.page ?? liveEntities;
	const entityStatus = prefetchedEntities
		? prefetchedEntities.isDone
			? "Exhausted"
			: "CanLoadMore"
		: liveEntityStatus;
	const hasOpenEntity = Boolean(selectedEntityId);
	const listSearch = selectedEntityType ? { type: selectedEntityType._id } : {};

	return (
		<ContextPanelLayout
			detailOpen={hasOpenEntity}
			list={
				<EntityList
					entityTypes={entityTypes}
					selectedEntityType={selectedEntityType}
					selectedEntityId={selectedEntityId}
					items={entities}
					status={entityStatus}
					loadMore={() => {
						if (liveEntityStatus !== "LoadingFirstPage") {
							loadMore(PAGE_SIZE);
						}
					}}
					onEntityTypeChange={(entityTypeId) => {
						void navigate({
							search: { type: entityTypeId },
						});
					}}
				/>
			}
			mobileBack={
				<Button
					nativeButton={false}
					variant="ghost"
					size="sm"
					render={<Link to="/entities" search={listSearch} />}
				>
					<IconArrowLeft />
					Back to entities
				</Button>
			}
			detail={
				<EntityView
					detail={selectedEntity}
					closeButton={
						<Button
							nativeButton={false}
							variant="ghost"
							size="icon-sm"
							render={
								<Link
									to="/entities"
									search={listSearch}
									aria-label="Close entity"
									title="Close entity"
								/>
							}
						>
							<IconX />
						</Button>
					}
				/>
			}
		/>
	);
}
