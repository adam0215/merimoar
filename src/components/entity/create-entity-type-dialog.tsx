import { IconChevronDown, IconLoader2, IconPlus } from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { useMemo, useState } from "react";
import * as v from "valibot";
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
import { entityTypeInputSchema } from "../../../convex/entity/input";

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
	const [showValidation, setShowValidation] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const validation = useMemo(
		() =>
			v.safeParse(entityTypeInputSchema, {
				...form,
				pluralName: form.pluralName || suggestPlural(form.name),
				icon,
			}),
		[form, icon],
	);

	function reset() {
		setForm(INITIAL_FORM);
		setIcon("box");
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
				<button
					type="button"
					className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg outline-none transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97]"
					aria-label="Create entity type"
					title="Create entity type"
				>
					<IconPlus className="size-5" />
				</button>
			</DialogTrigger>
			<DialogContent className="max-h-[calc(100svh-2rem)] gap-4 overflow-y-auto p-5 sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Create entity type</DialogTitle>
					<DialogDescription>Add a reusable business object.</DialogDescription>
				</DialogHeader>
				<form id="create-entity-type-form" onSubmit={submit} noValidate>
					<FieldGroup className="gap-4">
						<Collapsible>
							<Field>
								<div className="flex items-center justify-between gap-4">
									<FieldLabel htmlFor="entity-type-name">Name</FieldLabel>
									<CollapsibleTrigger className="flex items-center gap-1 text-sm font-normal text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&[data-state=open]>svg]:rotate-180">
										Advanced
										<IconChevronDown className="size-3.5 transition-transform" />
									</CollapsibleTrigger>
								</div>
								<Input
									id="entity-type-name"
									value={form.name}
									onChange={(event) =>
										setForm((current) => ({
											...current,
											name: event.target.value,
										}))
									}
									placeholder="Property"
									autoFocus
								/>
								<CollapsibleContent>
									<Field className="pt-1">
										<FieldLabel htmlFor="entity-type-plural">
											Plural name
											<span className="text-xs font-normal text-muted-foreground">
												Optional
											</span>
										</FieldLabel>
										<Input
											id="entity-type-plural"
											value={form.pluralName}
											onChange={(event) =>
												setForm((current) => ({
													...current,
													pluralName: event.target.value,
												}))
											}
											placeholder={suggestPlural(form.name) || "Properties"}
										/>
									</Field>
								</CollapsibleContent>
							</Field>
						</Collapsible>
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
								For example, “Invoice ID” or “Policy number”.
							</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="entity-type-description">
								Description
								<span className="text-xs font-normal text-muted-foreground">
									Optional
								</span>
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
							<div className="flex flex-wrap gap-2">
								{ENTITY_ICON_OPTIONS.map((option) => (
									<button
										key={option.key}
										type="button"
										onClick={() => setIcon(option.key)}
										aria-pressed={icon === option.key}
										aria-label={option.label}
										title={option.label}
										className={cn(
											"flex size-10 shrink-0 items-center justify-center rounded-full border text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]",
											icon === option.key &&
												"border-foreground bg-muted text-foreground",
										)}
									>
										<option.icon className="size-5" />
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
