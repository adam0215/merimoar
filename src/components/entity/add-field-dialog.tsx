import { IconLoader2, IconPlus } from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { useState } from "react";
import * as v from "valibot";
import { Button } from "#/components/ui/button.tsx";
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
	FieldError,
	FieldGroup,
	FieldLabel,
} from "#/components/ui/field.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
	type EntityFieldType,
	normalizeEntityKey,
} from "../../../convex/entity/constants";
import { ENTITY_FIELD_TYPE_LABELS } from "./types.ts";

export function AddFieldDialog({
	entityTypeId,
}: {
	entityTypeId: Id<"entityTypes">;
}) {
	const addField = useMutation(api.entity.mutations.addField);
	const [open, setOpen] = useState(false);
	const [label, setLabel] = useState("");
	const [key, setKey] = useState("");
	const [keyWasEdited, setKeyWasEdited] = useState(false);
	const [valueType, setValueType] = useState<EntityFieldType>("text");
	const [required, setRequired] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function reset() {
		setLabel("");
		setKey("");
		setKeyWasEdited(false);
		setValueType("text");
		setRequired(false);
		setIsSubmitting(false);
		setError(null);
	}

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const result = v.safeParse(
			v.object({
				label: v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(80)),
				key: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
			}),
			{ label, key },
		);

		if (!result.success) {
			setError("Enter a field label and key.");
			return;
		}

		setIsSubmitting(true);
		setError(null);

		try {
			await addField({
				entityTypeId,
				label: result.output.label,
				key: result.output.key,
				valueType,
				required,
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
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					<IconPlus />
					Add field
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add metadata field</DialogTitle>
					<DialogDescription>
						The field definition and its typed values are stored separately.
					</DialogDescription>
				</DialogHeader>
				<form id="add-entity-field-form" onSubmit={submit}>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="entity-field-label">Label</FieldLabel>
							<Input
								id="entity-field-label"
								value={label}
								onChange={(event) => {
									const nextLabel = event.target.value;
									setLabel(nextLabel);
									if (!keyWasEdited) {
										setKey(normalizeEntityKey(nextLabel));
									}
								}}
								placeholder="Municipality"
								autoFocus
							/>
						</Field>
						<div className="grid gap-5 sm:grid-cols-2">
							<Field>
								<FieldLabel htmlFor="entity-field-key">Field key</FieldLabel>
								<Input
									id="entity-field-key"
									value={key}
									onChange={(event) => {
										setKeyWasEdited(true);
										setKey(normalizeEntityKey(event.target.value));
									}}
									placeholder="municipality"
									className="font-mono"
								/>
							</Field>
							<Field>
								<FieldLabel>Value type</FieldLabel>
								<Select
									value={valueType}
									onValueChange={(value) => setValueType(parseFieldType(value))}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{Object.entries(ENTITY_FIELD_TYPE_LABELS).map(
											([value, fieldLabel]) => (
												<SelectItem key={value} value={value}>
													{fieldLabel}
												</SelectItem>
											),
										)}
									</SelectContent>
								</Select>
							</Field>
						</div>
						<label
							htmlFor="entity-field-required"
							className="flex cursor-pointer items-start gap-3 rounded-xl border p-3"
						>
							<Checkbox
								id="entity-field-required"
								checked={required}
								onCheckedChange={(value) => setRequired(value === true)}
							/>
							<span>
								<span className="block text-sm font-medium">Required</span>
								<span className="block text-xs text-muted-foreground">
									Every new record must provide this value.
								</span>
							</span>
						</label>
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
						form="add-entity-field-form"
						disabled={isSubmitting}
					>
						{isSubmitting && <IconLoader2 className="animate-spin" />}
						Add field
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function parseFieldType(value: string): EntityFieldType {
	return value === "number" || value === "boolean" || value === "date"
		? value
		: "text";
}
