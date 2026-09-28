import type { api } from "@merimoar/convex/api";
import { IconBox, IconClock } from "@tabler/icons-react";
import type { FunctionReturnType } from "convex/server";
import { formatEntityFieldValue } from "#/components/entity/entity-value.ts";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { formatShortDate } from "#/lib/date-format.ts";
import { EntityIcon } from "#/lib/entity-icons.tsx";
import { cn } from "#/lib/utils.ts";

type EntityDetail = FunctionReturnType<typeof api.entity.reader.getEntity>;

const SKELETON_ROWS = ["entity-a", "entity-b", "entity-c", "entity-d"];

export function EntityView({
	detail,
	closeButton,
}: {
	detail: EntityDetail | undefined;
	closeButton: React.ReactNode;
}) {
	if (detail === undefined) {
		return <EntityViewSkeleton />;
	}

	if (detail === null) {
		return (
			<div className="flex h-full flex-col items-center justify-center px-8 text-center">
				<IconBox className="mb-4 size-6 text-muted-foreground/50" />
				<h2 className="font-medium">Entity not found</h2>
				<p className="mt-1 max-w-72 text-sm text-muted-foreground">
					This entity is unavailable in the current organization.
				</p>
			</div>
		);
	}

	return (
		<div className="h-full overflow-y-auto overscroll-none">
			<div className="mx-auto w-full max-w-5xl p-6 pb-12">
				<div className="mb-2 hidden h-8 items-center justify-end md:flex">
					{closeButton}
				</div>

				<header className="flex items-start gap-4">
					<span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
						<EntityIcon icon={detail.entityType.icon} className="size-6" />
					</span>
					<div className="min-w-0 flex-1 pt-0.5">
						<p className="text-sm font-medium text-muted-foreground">
							{detail.entityType.name}
						</p>
						<h1 className="mt-1 text-2xl leading-tight font-semibold tracking-tight md:text-3xl">
							{detail.entity.displayName}
						</h1>
						<div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
							<span className="font-mono">{detail.entity.identifier}</span>
							<span className="size-1 rounded-full bg-border" />
							<span className="inline-flex items-center gap-1.5">
								<IconClock className="size-3.5" />
								Updated {formatShortDate(detail.entity.updatedAt)}
							</span>
						</div>
					</div>
				</header>

				<section className="mt-10">
					<h2 className="text-sm font-semibold">Details</h2>
					<dl className="mt-3 divide-y border-y">
						<EntityFieldRow
							label={detail.entityType.identifierLabel}
							value={detail.entity.identifier}
							monospace
						/>
						{detail.fieldDefinitions.map((field) => (
							<EntityFieldRow
								key={field._id}
								label={field.label}
								value={formatEntityFieldValue(
									detail.values.find(
										(value) => value.fieldDefinitionId === field._id,
									),
								)}
							/>
						))}
					</dl>
				</section>
			</div>
		</div>
	);
}

function EntityFieldRow({
	label,
	value,
	monospace = false,
}: {
	label: string;
	value?: string;
	monospace?: boolean;
}) {
	return (
		<div className="grid gap-1 py-4 sm:grid-cols-[minmax(10rem,0.55fr)_minmax(0,1fr)] sm:gap-8">
			<dt className="text-sm text-muted-foreground">{label}</dt>
			<dd
				className={cn(
					"min-w-0 break-words text-sm leading-6",
					monospace && "font-mono text-xs",
					value === undefined && "text-muted-foreground",
				)}
			>
				{value ?? "—"}
			</dd>
		</div>
	);
}

function EntityViewSkeleton() {
	return (
		<div className="mx-auto max-w-5xl p-6">
			<div className="flex items-start gap-4 pt-10 md:pt-0">
				<Skeleton className="size-14 shrink-0 rounded-full" />
				<div className="min-w-0 flex-1 space-y-3 pt-1">
					<Skeleton className="h-3 w-24" />
					<Skeleton className="h-8 w-3/5" />
					<Skeleton className="h-3 w-48" />
				</div>
			</div>
			<div className="mt-10 space-y-1">
				<Skeleton className="mb-3 h-4 w-20" />
				{SKELETON_ROWS.map((row) => (
					<div key={row} className="grid grid-cols-2 gap-8 border-t py-4">
						<Skeleton className="h-4 w-28" />
						<Skeleton className="h-4 w-3/4" />
					</div>
				))}
			</div>
		</div>
	);
}
