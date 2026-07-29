import { api } from "@merimoar/convex/api";
import type { Doc, Id } from "@merimoar/convex/data-model";
import { entityInputSchema } from "@merimoar/convex/entity/input";
import { IconCalendar, IconLoader2, IconPlus } from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { useState } from "react";
import * as v from "valibot";
import { buildEntityFieldValues } from "#/components/entity/entity-form-values.ts";
import { Button } from "#/components/ui/button.tsx";
import { Calendar } from "#/components/ui/calendar.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog.tsx";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "#/components/ui/field.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";
import { formatDateInput, parseDateInput } from "#/lib/date-input.ts";
import { cn } from "#/lib/utils.ts";

export function CreateEntityDialog({
	entityType,
	fieldDefinitions,
}: {
	entityType: Doc<"entityTypes">;
	fieldDefinitions: Doc<"entityFieldDefinitions">[];
}) {
	const createEntity = useMutation(api.entity.mutations.createEntity);
	const [open, setOpen] = useState(false);
	const [identifier, setIdentifier] = useState("");
	const [displayName, setDisplayName] = useState("");
	const [textValues, setTextValues] = useState<Record<string, string>>({});
	const [booleanValues, setBooleanValues] = useState<
		Map<Id<"entityFieldDefinitions">, boolean>
	>(new Map());
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function reset() {
		setIdentifier("");
		setDisplayName("");
		setTextValues({});
		setBooleanValues(new Map());
		setIsSubmitting(false);
		setError(null);
	}

	function setBooleanValue(
		fieldDefinitionId: Id<"entityFieldDefinitions">,
		value: boolean | undefined,
	) {
		setBooleanValues((current) => {
			const next = new Map(current);
			if (value === undefined) {
				next.delete(fieldDefinitionId);
			} else {
				next.set(fieldDefinitionId, value);
			}
			return next;
		});
	}

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const baseResult = v.safeParse(entityInputSchema, {
			identifier,
			displayName,
		});

		if (!baseResult.success) {
			setError(
				baseResult.issues[0]?.message ?? "Complete the required fields.",
			);
			return;
		}

		const fieldResult = buildEntityFieldValues(
			fieldDefinitions,
			textValues,
			booleanValues,
		);
		if (!fieldResult.success) {
			setError(fieldResult.message);
			return;
		}

		setIsSubmitting(true);
		setError(null);

		try {
			await createEntity({
				entityTypeId: entityType._id,
				identifier: baseResult.output.identifier,
				displayName: baseResult.output.displayName,
				values: fieldResult.values,
			});
			setOpen(false);
		} catch (caughtError) {
			setError(getConvexErrorMessage(caughtError));
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (nextOpen) {
					reset();
				}
				setOpen(nextOpen);
			}}
		>
			<DialogTrigger render={<Button size="sm" />}>
				<IconPlus />
				New
			</DialogTrigger>
			<DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Create {entityType.name.toLowerCase()}</DialogTitle>
					<DialogDescription>
						It will immediately become available as a case relationship.
					</DialogDescription>
				</DialogHeader>
				<form id="create-entity-form" onSubmit={submit}>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="entity-display-name">
								Display name
							</FieldLabel>
							<Input
								id="entity-display-name"
								value={displayName}
								onChange={(event) => setDisplayName(event.target.value)}
								placeholder={`A recognizable ${entityType.name.toLowerCase()} name`}
								autoFocus
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="entity-identifier">
								{entityType.identifierLabel}
							</FieldLabel>
							<Input
								id="entity-identifier"
								value={identifier}
								onChange={(event) => setIdentifier(event.target.value)}
								placeholder="Unique identifier"
								className="font-mono"
							/>
						</Field>
						{fieldDefinitions.map((field) =>
							field.valueType === "boolean" ? (
								<BooleanFieldInput
									key={field._id}
									field={field}
									value={booleanValues.get(field._id)}
									onChange={(value) => setBooleanValue(field._id, value)}
								/>
							) : field.valueType === "date" ? (
								<EntityDateFieldInput
									key={field._id}
									field={field}
									value={textValues[field._id] ?? ""}
									onChange={(value) =>
										setTextValues((current) => ({
											...current,
											[field._id]: value,
										}))
									}
								/>
							) : (
								<Field key={field._id}>
									<FieldLabel htmlFor={`entity-field-${field._id}`}>
										{field.label}
										{field.required && (
											<span className="text-destructive">*</span>
										)}
									</FieldLabel>
									<Input
										id={`entity-field-${field._id}`}
										type={field.valueType === "number" ? "number" : "text"}
										value={textValues[field._id] ?? ""}
										onChange={(event) =>
											setTextValues((current) => ({
												...current,
												[field._id]: event.target.value,
											}))
										}
									/>
								</Field>
							),
						)}
						{error && <FieldError>{error}</FieldError>}
					</FieldGroup>
				</form>
				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => setOpen(false)}
						disabled={isSubmitting}
					>
						Cancel
					</Button>
					<Button
						type="submit"
						form="create-entity-form"
						disabled={isSubmitting}
					>
						{isSubmitting && <IconLoader2 className="animate-spin" />}
						Create
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function EntityDateFieldInput({
	field,
	value,
	onChange,
}: {
	field: Doc<"entityFieldDefinitions">;
	value: string;
	onChange: (value: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const timestamp = value ? parseDateInput(value) : Number.NaN;
	const selectedDate = Number.isFinite(timestamp)
		? new Date(timestamp)
		: undefined;

	return (
		<Field>
			<FieldLabel>
				{field.label}
				{field.required && <span className="text-destructive">*</span>}
			</FieldLabel>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger
					render={
						<Button
							type="button"
							variant="outline"
							className={cn(
								"w-full justify-start text-left font-normal",
								!selectedDate && "text-muted-foreground",
							)}
						/>
					}
				>
					<IconCalendar />
					{selectedDate
						? selectedDate.toLocaleDateString(undefined, {
								year: "numeric",
								month: "long",
								day: "numeric",
							})
						: "Select date"}
				</PopoverTrigger>
				<PopoverContent
					align="start"
					variant="calendar"
					className="w-auto gap-0 p-0"
				>
					<Calendar
						mode="single"
						selected={selectedDate}
						onSelect={(date) => {
							if (!date) {
								return;
							}
							onChange(formatDateInput(date.getTime()));
							setOpen(false);
						}}
					/>
					{selectedDate && !field.required && (
						<div className="border-t p-2">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="w-full"
								onClick={() => {
									onChange("");
									setOpen(false);
								}}
							>
								Clear date
							</Button>
						</div>
					)}
				</PopoverContent>
			</Popover>
		</Field>
	);
}

function BooleanFieldInput({
	field,
	value,
	onChange,
}: {
	field: Doc<"entityFieldDefinitions">;
	value: boolean | undefined;
	onChange: (value: boolean | undefined) => void;
}) {
	if (field.required) {
		const inputId = `entity-boolean-${field._id}`;

		return (
			<label
				htmlFor={inputId}
				className="flex cursor-pointer items-start gap-3 rounded-xl border p-3"
			>
				<Checkbox
					id={inputId}
					checked={value ?? false}
					onCheckedChange={(checked) => onChange(checked === true)}
				/>
				<span>
					<span className="block text-sm font-medium">{field.label}</span>
					<span className="block text-xs text-muted-foreground">
						Required yes / no value
					</span>
				</span>
			</label>
		);
	}

	return (
		<Field>
			<FieldLabel>{field.label}</FieldLabel>
			<Select
				items={[
					{ value: "unset", label: "Not set" },
					{ value: "yes", label: "Yes" },
					{ value: "no", label: "No" },
				]}
				value={value === undefined ? "unset" : value ? "yes" : "no"}
				onValueChange={(nextValue) =>
					onChange(
						nextValue === "yes" ? true : nextValue === "no" ? false : undefined,
					)
				}
			>
				<SelectTrigger className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="unset">Not set</SelectItem>
					<SelectItem value="yes">Yes</SelectItem>
					<SelectItem value="no">No</SelectItem>
				</SelectContent>
			</Select>
			<FieldDescription>
				Optional — leave not set when the value is unknown.
			</FieldDescription>
		</Field>
	);
}
