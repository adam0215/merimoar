import { api } from "@merimoar/convex/api";
import {
	caseDescriptionSchema,
	caseEventBodySchema,
	caseTitleSchema,
	optionalCaseEventBodySchema,
} from "@merimoar/convex/case/input";
import type { Id } from "@merimoar/convex/data-model";
import { IconLoader2, IconPlus } from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { useEffect, useId, useMemo, useState } from "react";
import * as v from "valibot";
import { CaseDeadlineField } from "#/components/case/case-deadline-field.tsx";
import { CaseDescriptionEditor } from "#/components/case/case-description-editor.tsx";
import { CaseEventComposer } from "#/components/case/case-event-composer.tsx";
import {
	CaseRelationshipCard,
	getRelationshipKey,
	type RelationshipSearchCandidate,
	RelationshipSearchField,
	relationshipCandidateToCard,
} from "#/components/case/case-relationships.tsx";
import type { CaseCreateOptions } from "#/components/case/types.ts";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";
import { parseDateInput } from "#/lib/date-input.ts";
import { cn } from "#/lib/utils.ts";

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
const NO_INITIAL_CONTACTS: Id<"contacts">[] = [];
const NO_INITIAL_CONTACT_DETAILS: InitialCaseContact[] = [];

type InitialCaseContact = {
	_id: Id<"contacts">;
	address: string;
	name?: string;
};

export function CreateCaseDialog({
	options,
	onCreated,
	open: controlledOpen,
	onOpenChange,
	trigger,
	initialTitle = "",
	initialContactIds = NO_INITIAL_CONTACTS,
	initialContacts = NO_INITIAL_CONTACT_DETAILS,
	emailThreadId,
	variant = "default",
}: {
	options: CaseCreateOptions | undefined;
	onCreated: (caseId: Id<"cases">) => void;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	trigger?: React.ReactElement | null;
	initialTitle?: string;
	initialContactIds?: Id<"contacts">[];
	initialContacts?: InitialCaseContact[];
	emailThreadId?: Id<"emailThreads">;
	variant?: "default" | "email";
}) {
	const createCase = useMutation(api.case.mutations.create);
	const titleInputId = useId();
	const titleErrorId = useId();
	const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
	const open = controlledOpen ?? uncontrolledOpen;
	const [form, setForm] = useState({
		...INITIAL_FORM,
		title: initialTitle,
	});
	const [ownerMemberId, setOwnerMemberId] = useState<string>("unassigned");
	const [contactIds, setContactIds] = useState<Set<Id<"contacts">>>(
		new Set(initialContactIds),
	);
	const [relationships, setRelationships] = useState<
		Map<string, RelationshipSearchCandidate>
	>(new Map());
	const [initialEventComposerOpen, setInitialEventComposerOpen] =
		useState(false);
	const [initialEventComposerError, setInitialEventComposerError] = useState<
		string | null
	>(null);
	const [showValidation, setShowValidation] = useState(false);
	const [submissionError, setSubmissionError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const validation = useMemo(() => v.safeParse(createCaseSchema, form), [form]);
	const selectedRelationshipIds = useMemo(() => {
		const selectedContactIds = new Set(contactIds);
		const selectedEntityIds = new Set<Id<"entities">>();
		const selectedRelatedCaseIds = new Set<Id<"cases">>();

		for (const { target } of relationships.values()) {
			if (target.kind === "contact") {
				selectedContactIds.add(target.contactId);
			} else if (target.kind === "entity") {
				selectedEntityIds.add(target.entityId);
			} else {
				selectedRelatedCaseIds.add(target.caseId);
			}
		}

		return {
			contactIds: selectedContactIds,
			entityIds: selectedEntityIds,
			relatedCaseIds: selectedRelatedCaseIds,
		};
	}, [contactIds, relationships]);

	useEffect(() => {
		if (open && ownerMemberId === "unassigned" && options?.members[0]) {
			setOwnerMemberId(options.members[0]._id);
		}
	}, [open, options, ownerMemberId]);

	function reset() {
		setForm({ ...INITIAL_FORM, title: initialTitle });
		setOwnerMemberId("unassigned");
		setContactIds(new Set(initialContactIds));
		setRelationships(new Map());
		setInitialEventComposerOpen(false);
		setInitialEventComposerError(null);
		setShowValidation(false);
		setSubmissionError(null);
		setIsSubmitting(false);
	}

	function handleOpenChange(nextOpen: boolean) {
		reset();
		if (controlledOpen === undefined) {
			setUncontrolledOpen(nextOpen);
		}
		onOpenChange?.(nextOpen);
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

	function addRelationship(relationship: RelationshipSearchCandidate) {
		setRelationships((current) =>
			new Map(current).set(getRelationshipKey(relationship), relationship),
		);
	}

	function removeRelationship(relationship: RelationshipSearchCandidate) {
		setRelationships((current) => {
			const next = new Map(current);
			next.delete(getRelationshipKey(relationship));
			return next;
		});
	}

	function confirmInitialEvent() {
		const result = v.safeParse(caseEventBodySchema, form.initialEventBody);
		if (!result.success) {
			setInitialEventComposerError(
				result.issues[0]?.message ?? "Write an event first.",
			);
			return;
		}

		setInitialEventComposerError(null);
		setInitialEventComposerOpen(false);
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
				contactIds: [...selectedRelationshipIds.contactIds],
				entityIds: [...selectedRelationshipIds.entityIds],
				relatedCaseIds: [...selectedRelationshipIds.relatedCaseIds],
				...(emailThreadId ? { emailThreadId } : {}),
			});
			handleOpenChange(false);
			onCreated(caseId);
		} catch (error) {
			setSubmissionError(
				getConvexErrorMessage(error, "The case could not be created."),
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	function getValidationError(
		field: "title" | "description" | "initialEventBody",
	) {
		if (!showValidation || validation.success) {
			return undefined;
		}
		return validation.issues.find((issue) => issue.path?.[0]?.key === field)
			?.message;
	}

	const titleError = getValidationError("title");
	const descriptionError = getValidationError("description");
	const submittedInitialEventError = getValidationError("initialEventBody");
	const emailContacts =
		initialContacts.length > 0
			? initialContacts
			: (options?.contacts.filter((contact) =>
					initialContactIds.includes(contact._id),
				) ?? []);
	const selectedEmailContacts = emailContacts.filter((contact) =>
		contactIds.has(contact._id),
	);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			{trigger === null ? null : trigger ? (
				<DialogTrigger render={trigger} />
			) : (
				<DialogTrigger
					render={
						<button
							type="button"
							className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg outline-none transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/50"
							aria-label="Create case"
							title="Create case"
						/>
					}
				>
					<IconPlus className="size-5" />
				</DialogTrigger>
			)}
			<DialogContent
				className={cn(
					"max-h-[calc(100svh-2rem)] overflow-y-auto",
					variant === "default" ? "sm:max-w-2xl" : "sm:max-w-lg",
				)}
			>
				<DialogHeader>
					<DialogTitle>Create case</DialogTitle>
					<DialogDescription>
						{variant === "email"
							? "Start a case from this conversation."
							: "Add the initial context and relationships of the case."}
					</DialogDescription>
				</DialogHeader>

				<form id="create-case-form" onSubmit={submit} noValidate>
					<FieldGroup>
						<Field
							data-invalid={Boolean(titleError) || undefined}
							className="gap-0.5"
						>
							<FieldLabel htmlFor={titleInputId}>Title</FieldLabel>
							<div className="relative">
								<input
									id={titleInputId}
									type="text"
									value={form.title}
									onChange={(event) =>
										setForm((current) => ({
											...current,
											title: event.target.value,
										}))
									}
									placeholder="What needs to be resolved?"
									aria-invalid={Boolean(titleError) || undefined}
									aria-describedby={titleError ? titleErrorId : undefined}
									autoFocus
									className="peer w-full border-0 bg-transparent px-0 py-1 font-heading text-2xl leading-tight font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground md:text-3xl"
								/>
								<span
									aria-hidden="true"
									className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-transparent peer-focus-visible:bg-ring peer-aria-invalid:bg-destructive"
								/>
							</div>
							{titleError && (
								<FieldError id={titleErrorId}>{titleError}</FieldError>
							)}
						</Field>

						<div
							className={cn(
								"grid gap-5",
								variant === "default" && "sm:grid-cols-2",
							)}
						>
							<Field>
								<FieldLabel>Owner</FieldLabel>
								<Select
									items={[
										{ value: "unassigned", label: "Unassigned" },
										...(options?.members ?? []).map((member) => ({
											value: member._id,
											label: member.name,
										})),
									]}
									value={ownerMemberId}
									onValueChange={(value) => {
										if (value !== null) {
											setOwnerMemberId(value);
										}
									}}
								>
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
							{variant === "default" && (
								<CaseDeadlineField
									value={form.dueDate}
									onChange={(dueDate) =>
										setForm((current) => ({ ...current, dueDate }))
									}
								/>
							)}
						</div>

						{variant === "email" ? (
							<div className="space-y-2">
								<p className="text-sm font-medium">Contact</p>
								<div className="grid gap-2">
									{selectedEmailContacts.map((contact) => (
										<CaseRelationshipCard
											key={contact._id}
											item={initialContactToRelationshipCard(contact)}
											onRemove={() => toggleContact(contact._id, false)}
										/>
									))}
								</div>
							</div>
						) : (
							<>
								<Field data-invalid={Boolean(descriptionError) || undefined}>
									<FieldLabel htmlFor="create-case-description">
										Description
									</FieldLabel>
									<CaseDescriptionEditor
										id="create-case-description"
										value={form.description}
										onChange={(description) =>
											setForm((current) => ({
												...current,
												description,
											}))
										}
										invalid={Boolean(descriptionError)}
										readOnly={false}
									/>
									{descriptionError && (
										<FieldError>{descriptionError}</FieldError>
									)}
								</Field>

								{initialEventComposerOpen ? (
									<CaseEventComposer
										body={form.initialEventBody}
										onBodyChange={(initialEventBody) => {
											setForm((current) => ({
												...current,
												initialEventBody,
											}));
											setInitialEventComposerError(null);
										}}
										onCancel={() => {
											setForm((current) => ({
												...current,
												initialEventBody: "",
											}));
											setInitialEventComposerError(null);
											setInitialEventComposerOpen(false);
										}}
										onSubmit={confirmInitialEvent}
										error={
											initialEventComposerError ?? submittedInitialEventError
										}
									/>
								) : (
									<button
										type="button"
										onClick={() => setInitialEventComposerOpen(true)}
										className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-dashed p-2 text-left text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-99"
									>
										<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
											<IconPlus className="size-4" />
										</span>
										<span className="min-w-0">
											<span className="block text-sm font-medium">
												{form.initialEventBody
													? "Edit first event"
													: "Add first event"}
											</span>
											{form.initialEventBody && (
												<span className="block truncate text-xs text-muted-foreground">
													{form.initialEventBody}
												</span>
											)}
										</span>
									</button>
								)}

								<div className="space-y-4">
									<p className="text-sm font-medium">Relationships</p>
									<div className="grid gap-2 sm:grid-cols-2">
										{Array.from(relationships.values()).map((relationship) => (
											<CaseRelationshipCard
												key={getRelationshipKey(relationship)}
												item={relationshipCandidateToCard(relationship)}
												onRemove={() => removeRelationship(relationship)}
											/>
										))}
										<div className="sm:col-span-2">
											<RelationshipSearchField
												active={open}
												selectedResult={null}
												currentRelationshipIds={selectedRelationshipIds}
												resultsId="create-case-relationship-search-results"
												onSelectResult={addRelationship}
												onClearSelection={() => {}}
												onClose={() => handleOpenChange(false)}
												resetQueryOnSelect
												autoFocus={false}
											/>
										</div>
									</div>
								</div>
							</>
						)}

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
						onClick={() => handleOpenChange(false)}
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

function initialContactToRelationshipCard(contact: InitialCaseContact) {
	return relationshipCandidateToCard({
		target: { kind: "contact", contactId: contact._id },
		identifier: contact.address,
		label: contact.name || contact.address,
		descriptor: "Contact",
		icon: null,
	});
}
