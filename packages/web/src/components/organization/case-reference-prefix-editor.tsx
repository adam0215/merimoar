"use client";

import { api } from "@merimoar/convex/api";
import { organizationReferenceSlugSchema } from "@merimoar/convex/organization/input";
import { IconCheck, IconLoader2, IconPencil } from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import * as v from "valibot";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Field, FieldError, FieldLabel } from "#/components/ui/field.tsx";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "#/components/ui/input-group.tsx";
import { toast } from "#/components/ui/toast.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";

interface CaseReferencePrefixEditorProps {
	initialReferenceSlug: string;
}

export function CaseReferencePrefixEditor({
	initialReferenceSlug,
}: CaseReferencePrefixEditorProps) {
	const updateReferenceSlug = useMutation(
		api.organization.settings.updateReferenceSlug,
	);
	const inputRef = useRef<HTMLInputElement>(null);
	const [referenceSlug, setReferenceSlug] = useState(initialReferenceSlug);
	const [draft, setDraft] = useState("");
	const [isEditing, setIsEditing] = useState(false);
	const [confirmationOpen, setConfirmationOpen] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const validation = v.safeParse(organizationReferenceSlugSchema, draft);
	const validationError =
		isEditing && !validation.success
			? validation.issues[0]?.message
			: undefined;

	useEffect(() => {
		if (isEditing) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [isEditing]);

	function startEditing() {
		setDraft(referenceSlug);
		setIsEditing(true);
	}

	function confirmChange() {
		if (!validation.success) return;
		setDraft(validation.output);
		if (validation.output === referenceSlug) {
			setIsEditing(false);
		} else {
			setConfirmationOpen(true);
		}
	}

	function requestConfirmation(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		confirmChange();
	}

	async function save() {
		setIsSaving(true);
		try {
			await updateReferenceSlug({ referenceSlug: draft });
			setReferenceSlug(draft);
			setConfirmationOpen(false);
			setIsEditing(false);
		} catch (error) {
			toast.add({
				title: "Prefix could not be updated",
				description: getConvexErrorMessage(error, "Try again."),
				type: "error",
			});
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<>
			<form className="mt-3 max-w-md" onSubmit={requestConfirmation} noValidate>
				<Field className="gap-0">
					<FieldLabel htmlFor="case-reference-prefix">
						Case Reference Prefix
					</FieldLabel>
					<p className="mt-1 text-xs text-muted-foreground">
						2–4 letters before the case number, for example ACM.
					</p>
					<InputGroup className="mt-3">
						<InputGroupInput
							ref={inputRef}
							id="case-reference-prefix"
							value={isEditing ? draft : referenceSlug}
							disabled={!isEditing}
							autoComplete="off"
							spellCheck={false}
							aria-invalid={Boolean(validationError) || undefined}
							onChange={(event) => setDraft(event.target.value.toUpperCase())}
							onKeyDown={(event) => {
								if (event.key === "Escape") {
									setIsEditing(false);
								}
							}}
						/>
						<InputGroupAddon align="inline-end" className="pr-1">
							{isEditing ? (
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label="Confirm prefix"
									disabled={!validation.success}
									onClick={confirmChange}
								>
									<IconCheck />
								</Button>
							) : (
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									className="text-foreground"
									aria-label="Edit prefix"
									onClick={startEditing}
								>
									<IconPencil />
								</Button>
							)}
						</InputGroupAddon>
					</InputGroup>
					{validationError ? (
						<FieldError className="mt-2 text-xs">{validationError}</FieldError>
					) : (
						<p className="mt-2 text-xs text-muted-foreground">
							Existing cases keep their current references.
						</p>
					)}
				</Field>
			</form>

			<AlertDialog
				open={confirmationOpen}
				onOpenChange={(open) => !isSaving && setConfirmationOpen(open)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Change case reference prefix?</AlertDialogTitle>
						<AlertDialogDescription>
							Existing cases will not change. New cases will use {draft} as
							their prefix.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
						<AlertDialogAction disabled={isSaving} onClick={save}>
							{isSaving && <IconLoader2 className="animate-spin" />}
							Change prefix
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
