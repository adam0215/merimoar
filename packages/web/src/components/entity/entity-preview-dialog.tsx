import { api } from "@merimoar/convex/api";
import type { Doc, Id } from "@merimoar/convex/data-model";
import { IconChevronDown, IconEye } from "@tabler/icons-react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "#/components/ui/collapsible.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { EntityIcon } from "#/lib/entity-icons.tsx";

type EntityPreview = NonNullable<
	FunctionReturnType<typeof api.entity.reader.previewType>
>;

export function EntityPreviewDialog({
	entityTypes,
}: {
	entityTypes: Doc<"entityTypes">[] | undefined;
}) {
	const [open, setOpen] = useState(false);
	const [selectedTypeId, setSelectedTypeId] =
		useState<Id<"entityTypes"> | null>(null);
	const preview = useQuery(
		api.entity.reader.previewType,
		open && selectedTypeId ? { entityTypeId: selectedTypeId } : "skip",
	);

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
				if (!nextOpen) {
					setSelectedTypeId(null);
				}
			}}
		>
			<DialogTrigger render={<Button variant="secondary" />}>
				<IconEye />
				Preview
			</DialogTrigger>
			<DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Preview records</DialogTitle>
					<DialogDescription>
						Choose a type to inspect up to 10 records.
					</DialogDescription>
				</DialogHeader>

				<Select
					items={(entityTypes ?? []).map((entityType) => ({
						value: entityType._id,
						label: (
							<>
								<EntityIcon icon={entityType.icon} />
								{entityType.pluralName}
							</>
						),
					}))}
					value={selectedTypeId ?? undefined}
					onValueChange={(value) => {
						const selectedType = entityTypes?.find(
							(entityType) => entityType._id === value,
						);
						setSelectedTypeId(selectedType?._id ?? null);
					}}
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Choose entity type" />
					</SelectTrigger>
					<SelectContent>
						{entityTypes?.map((entityType) => (
							<SelectItem key={entityType._id} value={entityType._id}>
								<EntityIcon icon={entityType.icon} />
								{entityType.pluralName}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				{selectedTypeId && preview === undefined && <PreviewSkeleton />}

				{preview && (
					<div className="overflow-hidden rounded-2xl border">
						{preview.records.map((record) => (
							<PreviewRecord
								key={record.entity._id}
								record={record}
								fieldDefinitions={preview.fieldDefinitions}
								identifierLabel={preview.entityType.identifierLabel}
							/>
						))}
						{preview.records.length === 0 && (
							<div className="px-4 py-10 text-center">
								<p className="text-sm font-medium">No records yet</p>
								<p className="mt-1 text-sm text-muted-foreground">
									Create a record to preview its data.
								</p>
							</div>
						)}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

function PreviewRecord({
	record,
	fieldDefinitions,
	identifierLabel,
}: {
	record: EntityPreview["records"][number];
	fieldDefinitions: EntityPreview["fieldDefinitions"];
	identifierLabel: string;
}) {
	return (
		<Collapsible className="border-b last:border-b-0">
			<CollapsibleTrigger className="group flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted">
				<span className="min-w-0 flex-1">
					<span className="block truncate text-sm font-medium">
						{record.entity.displayName}
					</span>
					<span className="block truncate text-xs text-muted-foreground">
						{record.entity.identifier}
					</span>
				</span>
				<IconChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
			</CollapsibleTrigger>
			<CollapsibleContent>
				<dl className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)] gap-x-4 gap-y-3 border-t bg-muted/20 px-4 py-4 text-sm">
					<dt className="text-muted-foreground">{identifierLabel}</dt>
					<dd className="min-w-0 truncate font-mono text-xs">
						{record.entity.identifier}
					</dd>
					{fieldDefinitions.map((field) => (
						<FieldValue
							key={field._id}
							label={field.label}
							value={record.values.find(
								(value) => value.fieldDefinitionId === field._id,
							)}
						/>
					))}
				</dl>
			</CollapsibleContent>
		</Collapsible>
	);
}

function FieldValue({
	label,
	value,
}: {
	label: string;
	value: EntityPreview["records"][number]["values"][number] | undefined;
}) {
	return (
		<>
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="min-w-0 break-words">{formatPreviewValue(value)}</dd>
		</>
	);
}

function formatPreviewValue(
	value: EntityPreview["records"][number]["values"][number] | undefined,
) {
	if (!value) {
		return "—";
	}
	if (value.kind === "boolean") {
		return value.value ? "Yes" : "No";
	}
	if (value.kind === "number") {
		return value.value.toLocaleString();
	}
	if (value.kind === "date") {
		return new Date(value.value).toLocaleDateString(undefined, {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	}
	return value.value;
}

function PreviewSkeleton() {
	return (
		<div className="space-y-2 rounded-2xl border p-4">
			<Skeleton className="h-4 w-40" />
			<Skeleton className="h-3 w-24" />
			<Skeleton className="h-4 w-52" />
		</div>
	);
}
