import { IconAddressBook, IconDatabase, IconLock } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { Badge } from "#/components/ui/badge.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { EntityIcon } from "#/lib/entity-icons.tsx";
import { cn } from "#/lib/utils.ts";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { CreateEntityTypeDialog } from "./create-entity-type-dialog.tsx";
import { EntityTypeView } from "./entity-type-view.tsx";
import type { EntityTypeDetail } from "./types.ts";

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
			<aside className="min-h-0 overflow-y-auto border-r bg-muted/10 p-3">
				<div className="flex items-center justify-between gap-3 px-2 py-2">
					<div>
						<h1 className="text-sm font-semibold">Entity types</h1>
						<p className="mt-0.5 text-xs text-muted-foreground">
							Reusable relationship sources
						</p>
					</div>
					<CreateEntityTypeDialog onCreated={onTypeCreated} />
				</div>

				<div className="mt-2 space-y-1">
					<div className="flex items-center gap-3 rounded-xl border bg-background px-3 py-3">
						<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
							<IconAddressBook className="size-4" />
						</span>
						<span className="min-w-0 flex-1">
							<span className="flex items-center gap-1.5 text-sm font-medium">
								Contacts
								<IconLock className="size-3 text-muted-foreground" />
							</span>
							<span className="block truncate text-xs text-muted-foreground">
								Built-in system entity
							</span>
						</span>
						<Badge variant="outline" className="text-[10px]">
							Always on
						</Badge>
					</div>

					{entityTypes === undefined &&
						["type-a", "type-b", "type-c"].map((item) => (
							<div key={item} className="flex gap-3 rounded-xl px-3 py-3">
								<Skeleton className="size-9 rounded-lg" />
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
							<span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background">
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
			<div className="flex size-11 items-center justify-center rounded-xl bg-muted">
				<IconDatabase className="size-5" />
			</div>
			<h2 className="mt-5 text-2xl font-semibold tracking-tight">
				Model your organization
			</h2>
			<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
				Entity types describe the business objects a case can relate to.
				Contacts are always available; everything else can match your domain,
				from properties and policies to vehicles and contracts.
			</p>

			<div className="mt-8 grid gap-3 sm:grid-cols-3">
				<OverviewStat value={entityTypes?.length ?? "—"} label="Custom types" />
				<OverviewStat value="1" label="Built-in type" />
				<OverviewStat value="0–many" label="Relations per case" />
			</div>

			<div className="mt-8 rounded-2xl border bg-muted/20 p-5">
				<p className="text-sm font-medium">Normalized by design</p>
				<p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
					Each field definition and each typed value is stored as its own
					record. This keeps identifiers searchable and avoids opaque metadata
					blobs.
				</p>
			</div>
		</div>
	);
}

function OverviewStat({
	value,
	label,
}: {
	value: number | string;
	label: string;
}) {
	return (
		<div className="rounded-2xl border p-4">
			<p className="text-xl font-semibold">{value}</p>
			<p className="mt-1 text-xs text-muted-foreground">{label}</p>
		</div>
	);
}
