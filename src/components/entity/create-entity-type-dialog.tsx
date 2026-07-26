import { IconLoader2, IconPlus } from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { useMemo, useState } from "react";
import * as v from "valibot";
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
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "#/components/ui/field.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";
import { ENTITY_ICON_OPTIONS } from "#/lib/entity-icons.tsx";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { EntityIconKey } from "../../../convex/entity/constants";

const entityTypeSchema = v.object({
	name: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(2, "Use at least 2 characters."),
		v.maxLength(80, "Use no more than 80 characters."),
	),
	pluralName: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(2, "Use at least 2 characters."),
		v.maxLength(80, "Use no more than 80 characters."),
	),
	identifierLabel: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(2, "Use at least 2 characters."),
		v.maxLength(80, "Use no more than 80 characters."),
	),
	description: v.pipe(
		v.string(),
		v.trim(),
		v.maxLength(320, "Use no more than 320 characters."),
	),
});

const INITIAL_FORM = {
	name: "",
	pluralName: "",
	identifierLabel: "",
	description: "",
};

export function CreateEntityTypeDialog({
	onCreated,
}: {
	onCreated: (entityTypeId: Id<"entityTypes">) => void;
}) {
	const createType = useMutation(api.entity.mutations.createType);
	const [open, setOpen] = useState(false);
	const [form, setForm] = useState(INITIAL_FORM);
	const [icon, setIcon] = useState<EntityIconKey>("box");
	const [pluralWasEdited, setPluralWasEdited] = useState(false);
	const [showValidation, setShowValidation] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const validation = useMemo(() => v.safeParse(entityTypeSchema, form), [form]);

	function reset() {
		setForm(INITIAL_FORM);
		setIcon("box");
		setPluralWasEdited(false);
		setShowValidation(false);
		setIsSubmitting(false);
		setError(null);
	}

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setShowValidation(true);
		setError(null);

		if (!validation.success) {
			return;
		}

		setIsSubmitting(true);

		try {
			const entityTypeId = await createType({
				...validation.output,
				icon,
			});
			setOpen(false);
			onCreated(entityTypeId);
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
				<Button size="icon-sm" aria-label="Create entity type">
					<IconPlus />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Create entity type</DialogTitle>
					<DialogDescription>
						Define a reusable business object and how people recognize it.
					</DialogDescription>
				</DialogHeader>
				<form id="create-entity-type-form" onSubmit={submit} noValidate>
					<FieldGroup className="gap-5">
						<div className="grid gap-5 sm:grid-cols-2">
							<Field>
								<FieldLabel htmlFor="entity-type-name">
									Singular name
								</FieldLabel>
								<Input
									id="entity-type-name"
									value={form.name}
									onChange={(event) => {
										const name = event.target.value;
										setForm((current) => ({
											...current,
											name,
											pluralName: pluralWasEdited
												? current.pluralName
												: suggestPlural(name),
										}));
									}}
									placeholder="Property"
									autoFocus
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="entity-type-plural">
									Plural name
								</FieldLabel>
								<Input
									id="entity-type-plural"
									value={form.pluralName}
									onChange={(event) => {
										setPluralWasEdited(true);
										setForm((current) => ({
											...current,
											pluralName: event.target.value,
										}));
									}}
									placeholder="Properties"
								/>
							</Field>
						</div>
						<Field>
							<FieldLabel htmlFor="entity-type-identifier">
								Identifier label
							</FieldLabel>
							<Input
								id="entity-type-identifier"
								value={form.identifierLabel}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										identifierLabel: event.target.value,
									}))
								}
								placeholder="Property ID"
							/>
							<FieldDescription>
								The stable, unique reference people use to find a record.
							</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="entity-type-description">
								Description
							</FieldLabel>
							<Textarea
								id="entity-type-description"
								value={form.description}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										description: event.target.value,
									}))
								}
								placeholder="What does this entity represent?"
							/>
						</Field>
						<Field>
							<FieldLabel>Icon</FieldLabel>
							<FieldDescription>
								A curated set keeps entity types recognizable across the app.
							</FieldDescription>
							<div className="grid grid-cols-4 gap-2 sm:grid-cols-9">
								{ENTITY_ICON_OPTIONS.map((option) => (
									<button
										key={option.key}
										type="button"
										onClick={() => setIcon(option.key)}
										aria-pressed={icon === option.key}
										className={cn(
											"flex min-w-0 flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
											icon === option.key &&
												"border-foreground bg-muted text-foreground",
										)}
									>
										<option.icon className="size-5" />
										<span className="w-full truncate text-[11px]">
											{option.label}
										</span>
									</button>
								))}
							</div>
						</Field>
						{showValidation && !validation.success && (
							<FieldError>
								{validation.issues[0]?.message ??
									"Complete the required fields."}
							</FieldError>
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
						form="create-entity-type-form"
						disabled={isSubmitting}
					>
						{isSubmitting && <IconLoader2 className="animate-spin" />}
						Create type
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function suggestPlural(name: string) {
	const trimmed = name.trim();

	if (!trimmed) {
		return "";
	}
	if (/[^aeiou]y$/i.test(trimmed)) {
		return `${trimmed.slice(0, -1)}ies`;
	}
	if (/(s|x|z|ch|sh)$/i.test(trimmed)) {
		return `${trimmed}es`;
	}

	return `${trimmed}s`;
}
