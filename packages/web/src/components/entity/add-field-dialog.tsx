import { api } from "@merimoar/convex/api";
import type { Id } from "@merimoar/convex/data-model";
import type { EntityFieldType } from "@merimoar/convex/entity/constants";
import { entityFieldInputSchema } from "@merimoar/convex/entity/input";
import { IconLoader2, IconPlus } from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { useState } from "react";
import * as v from "valibot";
import { ENTITY_FIELD_TYPE_LABELS } from "#/components/entity/types.ts";
import { Button } from "#/components/ui/button.tsx";
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
import { Switch } from "#/components/ui/switch.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";

export function AddFieldDialog({
	entityTypeId,
}: {
	entityTypeId: Id<"entityTypes">;
}) {
	const addField = useMutation(api.entity.mutations.addField);
	const [open, setOpen] = useState(false);
	const [label, setLabel] = useState("");
	const [valueType, setValueType] = useState<EntityFieldType>("text");
	const [required, setRequired] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function reset() {
		setLabel("");
		setValueType("text");
		setRequired(false);
		setIsSubmitting(false);
		setError(null);
	}

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const result = v.safeParse(entityFieldInputSchema, {
			label,
			valueType,
			required,
		});

		if (!result.success) {
			setError("Enter a field label.");
			return;
		}

		setIsSubmitting(true);
		setError(null);

		try {
			await addField({
				entityTypeId,
				...result.output,
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
			<DialogTrigger render={<Button variant="outline" size="sm" />}>
				<IconPlus />
				Add field
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add field</DialogTitle>
					<DialogDescription>
						Choose how this value is entered.
					</DialogDescription>
				</DialogHeader>
				<form id="add-entity-field-form" onSubmit={submit}>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="entity-field-label">Label</FieldLabel>
							<Input
								id="entity-field-label"
								value={label}
								onChange={(event) => setLabel(event.target.value)}
								placeholder="Municipality"
								autoFocus
							/>
						</Field>
						<Field>
							<FieldLabel>Value type</FieldLabel>
							<Select
								items={Object.entries(ENTITY_FIELD_TYPE_LABELS).map(
									([value, fieldLabel]) => ({
										value,
										label: fieldLabel,
									}),
								)}
								value={valueType}
								onValueChange={(value) => {
									if (value !== null) {
										setValueType(parseFieldType(value));
									}
								}}
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
						<label
							htmlFor="entity-field-required"
							className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-3"
						>
							<span>
								<span className="block text-sm font-medium">Required</span>
								<span className="block text-xs text-muted-foreground">
									Every new record must provide this value.
								</span>
							</span>
							<Switch
								id="entity-field-required"
								checked={required}
								onCheckedChange={setRequired}
							/>
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
