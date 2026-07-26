import {
	IconAddressBook,
	IconCalendar,
	IconLoader2,
	IconPlus,
} from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { useEffect, useId, useMemo, useState } from "react";
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
import { Textarea } from "#/components/ui/textarea.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";
import { parseDateInput } from "#/lib/date-input.ts";
import { EntityIcon } from "#/lib/entity-icons.tsx";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
	caseDescriptionSchema,
	caseTitleSchema,
	optionalCaseEventBodySchema,
} from "../../../convex/case/input";
import type { CaseCreateOptions } from "./types.ts";

const createCaseSchema = v.object({
	title: caseTitleSchema,
	description: caseDescriptionSchema,
	initialEventBody: optionalCaseEventBodySchema,
});

const INITIAL_FORM = {
	title: "",
	description: "",
	dueDate: "",
	initialEventBody: "",
};

export function CreateCaseDialog({
	options,
	onCreated,
}: {
	options: CaseCreateOptions | undefined;
	onCreated: (caseId: Id<"cases">) => void;
}) {
	const createCase = useMutation(api.case.mutations.create);
	const [open, setOpen] = useState(false);
	const [form, setForm] = useState(INITIAL_FORM);
	const [ownerMemberId, setOwnerMemberId] = useState<string>("unassigned");
	const [contactIds, setContactIds] = useState<Set<Id<"contacts">>>(new Set());
	const [entityIds, setEntityIds] = useState<Set<Id<"entities">>>(new Set());
	const [showValidation, setShowValidation] = useState(false);
	const [submissionError, setSubmissionError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const validation = useMemo(() => v.safeParse(createCaseSchema, form), [form]);

	useEffect(() => {
		if (open && ownerMemberId === "unassigned" && options?.members[0]) {
			setOwnerMemberId(options.members[0]._id);
		}
	}, [open, options, ownerMemberId]);

	function reset() {
		setForm(INITIAL_FORM);
		setOwnerMemberId("unassigned");
		setContactIds(new Set());
		setEntityIds(new Set());
		setShowValidation(false);
		setSubmissionError(null);
		setIsSubmitting(false);
	}

	function handleOpenChange(nextOpen: boolean) {
		if (nextOpen) {
			reset();
		}
		setOpen(nextOpen);
	}

	function toggleContact(contactId: Id<"contacts">, checked: boolean) {
		setContactIds((current) => {
			const next = new Set(current);
			if (checked) {
				next.add(contactId);
			} else {
				next.delete(contactId);
			}
			return next;
		});
	}

	function toggleEntity(entityId: Id<"entities">, checked: boolean) {
		setEntityIds((current) => {
			const next = new Set(current);
			if (checked) {
				next.add(entityId);
			} else {
				next.delete(entityId);
			}
			return next;
		});
	}

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setShowValidation(true);
		setSubmissionError(null);
		if (!validation.success) {
			return;
		}

		setIsSubmitting(true);
		try {
			const owner = options?.members.find(
				(member) => member._id === ownerMemberId,
			);
			const caseId = await createCase({
				title: validation.output.title,
				description: validation.output.description,
				ownerMemberId:
					ownerMemberId === "unassigned" ? null : (owner?._id ?? null),
				dueAt: form.dueDate ? parseDateInput(form.dueDate) : null,
				initialEventBody: validation.output.initialEventBody,
				contactIds: [...contactIds],
				entityIds: [...entityIds],
			});
			setOpen(false);
			onCreated(caseId);
		} catch (error) {
			setSubmissionError(
				getConvexErrorMessage(error, "The case could not be created."),
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	const titleError =
		showValidation && !validation.success
			? validation.issues.find((issue) => issue.path?.[0]?.key === "title")
					?.message
			: undefined;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger asChild>
				<button
					type="button"
					className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg outline-none transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/50"
					aria-label="Create case"
					title="Create case"
				>
					<IconPlus className="size-5" />
				</button>
			</DialogTrigger>
			<DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Create case</DialogTitle>
					<DialogDescription>
						Add the stable details, initial context, and relationships.
					</DialogDescription>
				</DialogHeader>

				<form id="create-case-form" onSubmit={submit} noValidate>
					<FieldGroup>
						<Field data-invalid={Boolean(titleError) || undefined}>
							<FieldLabel htmlFor="case-title">Title</FieldLabel>
							<Input
								id="case-title"
								value={form.title}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										title: event.target.value,
									}))
								}
								placeholder="What needs to be resolved?"
								aria-invalid={Boolean(titleError) || undefined}
								autoFocus
							/>
							{titleError && <FieldError>{titleError}</FieldError>}
						</Field>

						<div className="grid gap-5 sm:grid-cols-2">
							<Field>
								<FieldLabel>Owner</FieldLabel>
								<Select value={ownerMemberId} onValueChange={setOwnerMemberId}>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="unassigned">Unassigned</SelectItem>
										{options?.members.map((member) => (
											<SelectItem key={member._id} value={member._id}>
												{member.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
							<Field>
								<FieldLabel htmlFor="case-due-date">Deadline</FieldLabel>
								<div className="relative">
									<IconCalendar className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
									<Input
										id="case-due-date"
										type="date"
										value={form.dueDate}
										onChange={(event) =>
											setForm((current) => ({
												...current,
												dueDate: event.target.value,
											}))
										}
										className="pl-9"
									/>
								</div>
							</Field>
						</div>

						<Field>
							<FieldLabel htmlFor="case-description">Description</FieldLabel>
							<Textarea
								id="case-description"
								value={form.description}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										description: event.target.value,
									}))
								}
								placeholder="Add the context someone needs before working on this case."
								className="min-h-24"
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor="case-initial-event">First event</FieldLabel>
							<Textarea
								id="case-initial-event"
								value={form.initialEventBody}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										initialEventBody: event.target.value,
									}))
								}
								placeholder="What has happened so far?"
							/>
						</Field>

						<div className="space-y-4">
							<div>
								<p className="text-sm font-medium">Relationships</p>
								<p className="mt-1 text-sm text-muted-foreground">
									Contacts remain visible in their own section on the case.
								</p>
							</div>

							<div className="rounded-xl border">
								<div className="flex items-center gap-2 border-b px-3 py-2.5">
									<IconAddressBook className="size-4 text-muted-foreground" />
									<p className="text-sm font-medium">Contacts</p>
								</div>
								<div className="grid max-h-36 gap-1 overflow-y-auto p-2 sm:grid-cols-2">
									{options?.contacts.map((contact) => (
										<RelationCheckbox
											key={contact._id}
											checked={contactIds.has(contact._id)}
											onCheckedChange={(checked) =>
												toggleContact(contact._id, checked)
											}
											label={contact.name || contact.address}
											description={contact.name ? contact.address : undefined}
										/>
									))}
									{options?.contacts.length === 0 && (
										<p className="px-2 py-3 text-sm text-muted-foreground">
											No contacts yet.
										</p>
									)}
								</div>
							</div>

							{options?.entityTypes.map(({ entityType, entities }) => (
								<div key={entityType._id} className="rounded-xl border">
									<div className="flex items-center gap-2 border-b px-3 py-2.5">
										<EntityIcon
											icon={entityType.icon}
											className="size-4 text-muted-foreground"
										/>
										<p className="text-sm font-medium">
											{entityType.pluralName}
										</p>
									</div>
									<div className="grid max-h-36 gap-1 overflow-y-auto p-2 sm:grid-cols-2">
										{entities.map((entity) => (
											<RelationCheckbox
												key={entity._id}
												checked={entityIds.has(entity._id)}
												onCheckedChange={(checked) =>
													toggleEntity(entity._id, checked)
												}
												label={entity.displayName}
												description={entity.identifier}
											/>
										))}
										{entities.length === 0 && (
											<p className="px-2 py-3 text-sm text-muted-foreground">
												No {entityType.pluralName.toLowerCase()} yet.
											</p>
										)}
									</div>
								</div>
							))}
						</div>

						{submissionError && (
							<p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
								{submissionError}
							</p>
						)}
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
					<Button type="submit" form="create-case-form" disabled={isSubmitting}>
						{isSubmitting && <IconLoader2 className="size-4 animate-spin" />}
						Create case
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function RelationCheckbox({
	checked,
	onCheckedChange,
	label,
	description,
}: {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	label: string;
	description?: string;
}) {
	const checkboxId = useId();

	return (
		<label
			htmlFor={checkboxId}
			className={cn(
				"flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted",
				checked && "bg-muted",
			)}
		>
			<Checkbox
				id={checkboxId}
				checked={checked}
				onCheckedChange={(value) => onCheckedChange(value === true)}
			/>
			<span className="min-w-0">
				<span className="block truncate text-sm font-medium">{label}</span>
				{description && (
					<span className="block truncate text-xs text-muted-foreground">
						{description}
					</span>
				)}
			</span>
		</label>
	);
}
