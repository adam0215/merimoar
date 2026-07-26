import { IconDatabase, IconHash } from "@tabler/icons-react";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { EntityIcon } from "#/lib/entity-icons.tsx";
import { AddFieldDialog } from "./add-field-dialog.tsx";
import { CreateEntityDialog } from "./create-entity-dialog.tsx";
import { EntityFieldTypeIcon } from "./entity-field-type.tsx";
import { ENTITY_FIELD_TYPE_LABELS, type EntityTypeDetail } from "./types.ts";

export function EntityTypeView({
	detail,
}: {
	detail: EntityTypeDetail | null | undefined;
}) {
	if (detail === undefined) {
		return (
			<div className="mx-auto max-w-5xl px-5 py-8 md:px-10 md:py-12">
				<div className="flex gap-4">
					<Skeleton className="size-12 rounded-xl" />
					<div className="flex-1 space-y-2">
						<Skeleton className="h-6 w-48" />
						<Skeleton className="h-4 w-80 max-w-full" />
					</div>
				</div>
				<Skeleton className="mt-8 h-36 rounded-2xl" />
				<Skeleton className="mt-8 h-56 rounded-2xl" />
			</div>
		);
	}

	if (!detail) {
		return (
			<div className="flex h-full flex-col items-center justify-center px-8 text-center">
				<IconDatabase className="mb-4 size-6 text-muted-foreground/50" />
				<h2 className="font-medium">Entity type not found</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					It may no longer be available in this organization.
				</p>
			</div>
		);
	}

	const { entityType, fieldDefinitions, entities } = detail;

	return (
		<div className="mx-auto w-full max-w-5xl px-5 py-8 md:px-10 md:py-12">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div className="flex min-w-0 gap-4">
					<span className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-muted/30">
						<EntityIcon icon={entityType.icon} className="size-5" />
					</span>
					<div className="min-w-0">
						<h1 className="text-2xl font-semibold tracking-tight">
							{entityType.pluralName}
						</h1>
						<p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
							{entityType.description || `Manage ${entityType.pluralName}.`}
						</p>
					</div>
				</div>
				<CreateEntityDialog
					entityType={entityType}
					fieldDefinitions={fieldDefinitions}
				/>
			</header>

			<section className="mt-8">
				<div className="flex items-center justify-between gap-4">
					<div>
						<h2 className="text-sm font-semibold">Metadata fields</h2>
						<p className="mt-1 text-xs text-muted-foreground">
							Typed attributes stored as separate, searchable values.
						</p>
					</div>
					<AddFieldDialog entityTypeId={entityType._id} />
				</div>

				<div className="mt-3 overflow-hidden rounded-2xl border">
					<div className="grid grid-cols-[minmax(0,1fr)_8rem_5rem] gap-3 border-b bg-muted/30 px-4 py-2.5 text-xs font-medium text-muted-foreground">
						<span>Field</span>
						<span>Type</span>
						<span>Required</span>
					</div>
					<div className="grid grid-cols-[minmax(0,1fr)_8rem_5rem] items-center gap-3 border-b px-4 py-3 last:border-b-0">
						<div className="min-w-0">
							<p className="truncate text-sm font-medium">
								{entityType.identifierLabel}
							</p>
							<p className="truncate text-xs text-muted-foreground">
								System identifier
							</p>
						</div>
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<IconHash className="size-4" />
							Unique
						</div>
						<span className="text-sm">Yes</span>
					</div>
					{fieldDefinitions.map((field) => (
						<div
							key={field._id}
							className="grid grid-cols-[minmax(0,1fr)_8rem_5rem] items-center gap-3 border-b px-4 py-3 last:border-b-0"
						>
							<div className="min-w-0">
								<p className="truncate text-sm font-medium">{field.label}</p>
								<p className="truncate text-xs text-muted-foreground">
									{field.key}
								</p>
							</div>
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<EntityFieldTypeIcon valueType={field.valueType} />
								{ENTITY_FIELD_TYPE_LABELS[field.valueType]}
							</div>
							<span className="text-sm">{field.required ? "Yes" : "No"}</span>
						</div>
					))}
					{fieldDefinitions.length === 0 && (
						<p className="border-t px-4 py-5 text-sm text-muted-foreground">
							No custom metadata fields yet.
						</p>
					)}
				</div>
			</section>

			<section className="mt-8">
				<div>
					<h2 className="text-sm font-semibold">{entityType.pluralName}</h2>
					<p className="mt-1 text-xs text-muted-foreground">
						Available records that can be related to a case.
					</p>
				</div>
				<div className="mt-3 overflow-hidden rounded-2xl border">
					<div className="grid grid-cols-[minmax(0,1fr)_minmax(8rem,0.65fr)] gap-3 border-b bg-muted/30 px-4 py-2.5 text-xs font-medium text-muted-foreground">
						<span>Name</span>
						<span>{entityType.identifierLabel}</span>
					</div>
					{entities.map((entity) => (
						<div
							key={entity._id}
							className="grid grid-cols-[minmax(0,1fr)_minmax(8rem,0.65fr)] items-center gap-3 border-b px-4 py-3 last:border-b-0"
						>
							<p className="truncate text-sm font-medium">
								{entity.displayName}
							</p>
							<p className="truncate font-mono text-xs text-muted-foreground">
								{entity.identifier}
							</p>
						</div>
					))}
					{entities.length === 0 && (
						<div className="px-4 py-8 text-center">
							<p className="text-sm font-medium">
								No {entityType.pluralName.toLowerCase()} yet
							</p>
							<p className="mt-1 text-sm text-muted-foreground">
								Create one to make it available on cases.
							</p>
						</div>
					)}
				</div>
			</section>
		</div>
	);
}
