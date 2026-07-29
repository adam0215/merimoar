import type { Doc, Id } from "@merimoar/convex/data-model";
import { IconDatabase } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { CreateEntityTypeDialog } from "#/components/entity/create-entity-type-dialog.tsx";
import { EntityPreviewDialog } from "#/components/entity/entity-preview-dialog.tsx";
import { EntityTypeView } from "#/components/entity/entity-type-view.tsx";
import type { EntityTypeDetail } from "#/components/entity/types.ts";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { EntityIcon } from "#/lib/entity-icons.tsx";
import { cn } from "#/lib/utils.ts";

export function EntitySettings({
	entityTypes,
	selectedTypeId,
	detail,
	onTypeCreated,
}: {
	entityTypes: Doc<"entityTypes">[] | undefined;
	selectedTypeId?: string;
	detail: EntityTypeDetail | null | undefined;
	onTypeCreated: (entityTypeId: Id<"entityTypes">) => void;
}) {
	return (
		<div className="grid h-full min-h-0 overflow-hidden lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[23rem_minmax(0,1fr)]">
			<aside className="flex min-h-0 flex-col border-r bg-muted/10">
				<div className="px-5 pt-5 pb-2">
					<h1 className="text-sm font-semibold">Entity types</h1>
				</div>

				<div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3">
					{entityTypes === undefined &&
						["type-a", "type-b", "type-c"].map((item) => (
							<div key={item} className="flex gap-3 rounded-xl px-3 py-3">
								<Skeleton className="size-9 rounded-full" />
								<div className="flex-1 space-y-2">
									<Skeleton className="h-3 w-24" />
									<Skeleton className="h-3 w-32" />
								</div>
							</div>
						))}

					{entityTypes?.map((entityType) => (
						<Link
							key={entityType._id}
							to="/settings/organization/entities"
							search={{ type: entityType._id }}
							className={cn(
								"flex items-center gap-3 rounded-xl px-3 py-3 text-foreground no-underline outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
								selectedTypeId === entityType._id && "bg-muted",
							)}
						>
							<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
								<EntityIcon icon={entityType.icon} className="size-4" />
							</span>
							<span className="min-w-0">
								<span className="block truncate text-sm font-medium">
									{entityType.pluralName}
								</span>
								<span className="block truncate text-xs text-muted-foreground">
									{entityType.identifierLabel}
								</span>
							</span>
						</Link>
					))}
				</div>

				<div className="flex shrink-0 items-center justify-end gap-2 p-3">
					<EntityPreviewDialog entityTypes={entityTypes} />
					<CreateEntityTypeDialog onCreated={onTypeCreated} />
				</div>
			</aside>

			<main className="min-h-0 min-w-0 overflow-y-auto">
				{selectedTypeId ? (
					<EntityTypeView detail={detail} />
				) : (
					<EntityOverview entityTypes={entityTypes} />
				)}
			</main>
		</div>
	);
}

function EntityOverview({
	entityTypes,
}: {
	entityTypes: Doc<"entityTypes">[] | undefined;
}) {
	return (
		<div className="mx-auto max-w-4xl px-5 py-8 md:px-10 md:py-12">
			<div className="flex size-11 items-center justify-center rounded-full bg-muted">
				<IconDatabase className="size-5" />
			</div>
			<h2 className="mt-5 text-2xl font-semibold tracking-tight">
				Model your organization
			</h2>
			<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
				Create reusable business objects that cases can relate to, such as
				properties, appointments, invoices, vehicles, or contracts.
			</p>
			<div className="mt-8 max-w-48 rounded-2xl border p-4">
				<p className="text-xs text-muted-foreground">Entity types</p>
				<p className="mt-1 text-xl font-semibold">
					{entityTypes?.length ?? "—"}
				</p>
			</div>
		</div>
	);
}
