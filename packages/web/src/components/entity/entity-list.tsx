import type { api } from "@merimoar/convex/api";
import type { Doc, Id } from "@merimoar/convex/data-model";
import { IconBox, IconLoader2 } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { EntityTypeSelect } from "#/components/entity/entity-type-select.tsx";
import { BrowserListItem } from "#/components/ui/browser-list-item.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { formatShortDate } from "#/lib/date-format.ts";
import { EntityIcon } from "#/lib/entity-icons.tsx";
import { cn } from "#/lib/utils.ts";

type EntityListItem = FunctionReturnType<
	typeof api.entity.reader.listEntities
>["page"][number];

type PaginationStatus =
	| "LoadingFirstPage"
	| "CanLoadMore"
	| "LoadingMore"
	| "Exhausted";

const SKELETON_ROWS = [
	"entity-a",
	"entity-b",
	"entity-c",
	"entity-d",
	"entity-e",
	"entity-f",
];

export function EntityList({
	entityTypes,
	selectedEntityType,
	selectedEntityId,
	items,
	status,
	loadMore,
	onEntityTypeChange,
}: {
	entityTypes: Doc<"entityTypes">[];
	selectedEntityType: Doc<"entityTypes"> | undefined;
	selectedEntityId?: string;
	items: EntityListItem[];
	status: PaginationStatus;
	loadMore: () => void;
	onEntityTypeChange: (entityTypeId: Id<"entityTypes">) => void;
}) {
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
				<span className="text-sm font-medium">Entity type</span>
				<EntityTypeSelect
					entityTypes={entityTypes}
					value={selectedEntityType?._id}
					onValueChange={onEntityTypeChange}
					placeholder="No entity types"
					size="sm"
					className="min-w-40 max-w-56"
					align="end"
					ariaLabel="Entity type"
				/>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto overscroll-none p-2 pb-8">
				<EntityListContent
					entityType={selectedEntityType}
					selectedEntityId={selectedEntityId}
					items={items}
					status={status}
					loadMore={loadMore}
				/>
			</div>
		</div>
	);
}

function EntityListContent({
	entityType,
	selectedEntityId,
	items,
	status,
	loadMore,
}: {
	entityType: Doc<"entityTypes"> | undefined;
	selectedEntityId?: string;
	items: EntityListItem[];
	status: PaginationStatus;
	loadMore: () => void;
}) {
	if (!entityType) {
		return (
			<div className="flex h-full flex-col items-center justify-center px-8 text-center">
				<IconBox className="mb-4 size-6 text-muted-foreground/50" />
				<h2 className="font-medium">No entity types yet</h2>
				<Button
					nativeButton={false}
					variant="link"
					size="sm"
					className="mt-1"
					render={<Link to="/settings/organization/entities" search={{}} />}
				>
					Set up an entity type
				</Button>
			</div>
		);
	}

	if (status === "LoadingFirstPage") {
		return (
			<div className="space-y-1">
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

	if (items.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center px-8 text-center">
				<span className="mb-4 flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
					<EntityIcon icon={entityType.icon} className="size-4" />
				</span>
				<h2 className="font-medium">No entities of this type</h2>
				<p className="mt-1 max-w-64 text-sm text-muted-foreground">
					{entityType.pluralName} will appear here.
				</p>
			</div>
		);
	}

	return (
		<>
			{items.map((entity) => {
				const isActive = entity._id === selectedEntityId;

				return (
					<BrowserListItem
						key={entity._id}
						active={isActive}
						render={
							<Link
								to="/entities"
								search={{ entity: entity._id, type: entityType._id }}
							/>
						}
						visual={
							<span
								className={cn(
									"mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground",
									isActive && "bg-background",
								)}
							>
								<EntityIcon icon={entityType.icon} className="size-4" />
							</span>
						}
						title={entity.displayName}
						subtitle={entity.identifier}
						trailing={
							<time className="shrink-0 text-xs text-muted-foreground">
								{formatShortDate(entity.updatedAt)}
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
		</>
	);
}
