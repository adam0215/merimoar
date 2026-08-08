import { api } from "@merimoar/convex/api";
import {
	caseDescriptionSchema,
	caseTitleSchema,
} from "@merimoar/convex/case/input";
import type { Doc, Id } from "@merimoar/convex/data-model";
import {
	IconAlertCircle,
	IconCheck,
	IconClock,
	IconInfoCircle,
	IconLoader2,
	IconLock,
} from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as v from "valibot";
import { CaseActionsMenu } from "#/components/case/case-actions-menu.tsx";
import { CaseDeadlineField } from "#/components/case/case-deadline-field.tsx";
import { CaseDescriptionEditor } from "#/components/case/case-description-editor.tsx";
import { useCurrentCaseInteractionPolicy } from "#/components/case/case-interaction-policy.tsx";
import {
	CASE_STATUS_OPTIONS,
	CaseStatusDot,
} from "#/components/case/case-status.tsx";
import type { CaseCreateOptions, CaseDetail } from "#/components/case/types.ts";
import { Button } from "#/components/ui/button.tsx";
import { Field, FieldError, FieldLabel } from "#/components/ui/field.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { toast } from "#/components/ui/toast.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";
import { formatShortDate } from "#/lib/date-format.ts";
import { formatDateInput, parseDateInput } from "#/lib/date-input.ts";

const editableCaseFieldsSchema = v.object({
	title: caseTitleSchema,
	description: caseDescriptionSchema,
});

const CASE_STATUS_SELECT_ITEMS = CASE_STATUS_OPTIONS.map((option) => ({
	value: option.value,
	label: (
		<>
			<CaseStatusDot status={option.value} />
			{option.label}
		</>
	),
}));

type CaseForm = ReturnType<typeof caseToForm>;

type SaveState =
	| { kind: "saved" }
	| { kind: "dirty" }
	| { kind: "saving" }
	| { kind: "error"; message: string };

export function CaseHeader({
	detail,
	members,
	closeButton,
	onDeleted,
}: {
	detail: CaseDetail;
	members: CaseCreateOptions["members"];
	closeButton: React.ReactNode;
	onDeleted: () => void;
}) {
	const updateCase = useMutation(api.case.mutations.update);
	const removeCase = useMutation(api.case.mutations.remove);
	const { readOnly, readOnlyReason } = useCurrentCaseInteractionPolicy();
	const [form, setForm] = useState(() => caseToForm(detail.case));
	const [saveState, setSaveState] = useState<SaveState>({ kind: "saved" });
	const latestFormRef = useRef(form);
	const lastSavedFormRef = useRef(form);
	const lastQueuedSignatureRef = useRef<string | null>(null);
	const saveChainRef = useRef(Promise.resolve());
	const isMountedRef = useRef(true);
	const deletionRequestedRef = useRef(false);

	const validation = useMemo(() => parseEditableCaseFields(form), [form]);

	useEffect(() => {
		latestFormRef.current = form;
	}, [form]);

	useEffect(() => {
		const serverForm = caseToForm(detail.case);
		const localFormIsPristine = formsMatch(
			latestFormRef.current,
			lastSavedFormRef.current,
		);
		const serverFormChanged = !formsMatch(serverForm, lastSavedFormRef.current);
		if (readOnly || (localFormIsPristine && serverFormChanged)) {
			latestFormRef.current = serverForm;
			lastSavedFormRef.current = serverForm;
			lastQueuedSignatureRef.current = formSignature(serverForm);
			setForm(serverForm);
			setSaveState({ kind: "saved" });
		}
	}, [detail.case, readOnly]);

	const queueSave = useCallback(
		(snapshot: CaseForm) => {
			if (readOnly || deletionRequestedRef.current) return;
			const signature = formSignature(snapshot);
			if (signature === lastQueuedSignatureRef.current) {
				return;
			}

			lastQueuedSignatureRef.current = signature;
			if (isMountedRef.current) {
				setSaveState({ kind: "saving" });
			}
			saveChainRef.current = saveChainRef.current.then(async () => {
				if (formsMatch(snapshot, lastSavedFormRef.current)) {
					if (isMountedRef.current) {
						setSaveState({ kind: "saved" });
					}
					return;
				}

				const snapshotValidation = parseEditableCaseFields(snapshot);
				if (!snapshotValidation.success) {
					return;
				}
				const normalizedSnapshot = {
					...snapshot,
					title: snapshotValidation.output.title,
					description: snapshotValidation.output.description,
				};

				try {
					await updateCase({
						caseId: detail.case._id,
						title: normalizedSnapshot.title,
						description: normalizedSnapshot.description,
						ownerMemberId: normalizedSnapshot.ownerMemberId,
						dueAt: normalizedSnapshot.dueDate
							? parseDateInput(normalizedSnapshot.dueDate)
							: null,
						status: normalizedSnapshot.status,
					});
					lastSavedFormRef.current = normalizedSnapshot;

					if (
						isMountedRef.current &&
						formsMatch(latestFormRef.current, snapshot)
					) {
						latestFormRef.current = normalizedSnapshot;
						lastQueuedSignatureRef.current = formSignature(normalizedSnapshot);
						setForm(normalizedSnapshot);
						setSaveState({ kind: "saved" });
					} else if (
						isMountedRef.current &&
						lastQueuedSignatureRef.current === signature
					) {
						setSaveState({ kind: "dirty" });
					}
				} catch (caughtError) {
					const failedLatestSave = lastQueuedSignatureRef.current === signature;
					if (failedLatestSave) {
						lastQueuedSignatureRef.current = null;
					}
					const message = getConvexErrorMessage(
						caughtError,
						"Changes could not be saved.",
					);
					if (
						isMountedRef.current &&
						formsMatch(latestFormRef.current, snapshot)
					) {
						setSaveState({
							kind: "error",
							message,
						});
					} else if (!isMountedRef.current && failedLatestSave) {
						toast.add({
							title: `${detail.case.reference} was not saved`,
							description: message,
							type: "error",
						});
					}
				}
			});
		},
		[detail.case._id, detail.case.reference, readOnly, updateCase],
	);

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
			const pendingForm = latestFormRef.current;
			const pendingValidation = parseEditableCaseFields(pendingForm);
			if (
				!readOnly &&
				pendingValidation.success &&
				!formsMatch(pendingForm, lastSavedFormRef.current)
			) {
				queueSave(pendingForm);
			}
		};
	}, [queueSave, readOnly]);

	useEffect(() => {
		if (readOnly) return;
		if (formsMatch(form, lastSavedFormRef.current)) {
			if (
				lastQueuedSignatureRef.current !== null &&
				lastQueuedSignatureRef.current !== formSignature(form)
			) {
				queueSave(form);
			} else {
				setSaveState({ kind: "saved" });
			}
			return;
		}
		if (!validation.success) {
			setSaveState({ kind: "dirty" });
			return;
		}

		setSaveState((current) =>
			current.kind === "saving" ? current : { kind: "dirty" },
		);
		const timeout = window.setTimeout(() => {
			queueSave(form);
		}, 700);

		return () => window.clearTimeout(timeout);
	}, [form, queueSave, readOnly, validation]);

	function retrySave() {
		if (!validation.success) {
			return;
		}
		lastQueuedSignatureRef.current = null;
		queueSave(latestFormRef.current);
	}

	async function deleteCase() {
		deletionRequestedRef.current = true;
		try {
			await saveChainRef.current;
			await removeCase({ caseId: detail.case._id });
		} catch (error) {
			deletionRequestedRef.current = false;
			const pendingForm = latestFormRef.current;
			const pendingValidation = parseEditableCaseFields(pendingForm);
			if (
				pendingValidation.success &&
				!formsMatch(pendingForm, lastSavedFormRef.current)
			) {
				queueSave(pendingForm);
			}
			throw error;
		}

		toast.add({ title: `${detail.case.reference} deleted`, type: "success" });
		onDeleted();
	}

	const titleError = !validation.success
		? validation.issues.find((issue) => issue.path?.[0]?.key === "title")
				?.message
		: undefined;
	const descriptionError = !validation.success
		? validation.issues.find((issue) => issue.path?.[0]?.key === "description")
				?.message
		: undefined;
	return (
		<header>
			<div className="mb-2 hidden h-8 items-center justify-end gap-1 sm:flex">
				<CaseActionsMenu
					caseReference={detail.case.reference}
					disabled={readOnly}
					onDelete={deleteCase}
				/>
				{closeButton}
			</div>
			<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
					<span className="font-medium tracking-wide">
						{detail.case.reference}
					</span>
					<span className="hidden size-1 rounded-full bg-border sm:block" />
					<span className="inline-flex items-center gap-1.5">
						<IconClock className="size-3.5" />
						Updated {formatShortDate(detail.case.lastActivityAt)}
					</span>
					{detail.agentTasks.length > 0 && (
						<>
							<span className="hidden size-1 rounded-full bg-border sm:block" />
							<span className="inline-flex items-center gap-1.5">
								<IconInfoCircle className="size-3.5" />
								Worked on by agent
							</span>
						</>
					)}
				</div>
				{readOnly ? (
					<span
						className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
						title={readOnlyReason}
					>
						<IconLock className="size-3.5" />
						Agent owned · read only
					</span>
				) : (
					<SaveStatus state={saveState} onRetry={retrySave} />
				)}
			</div>

			<Field
				data-invalid={Boolean(titleError) || undefined}
				className="mt-4 gap-1.5"
			>
				<FieldLabel htmlFor="case-title" className="sr-only">
					Title
				</FieldLabel>
				<Textarea
					id="case-title"
					value={form.title}
					onChange={(event) =>
						setForm((current) => ({
							...current,
							title: event.target.value,
						}))
					}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
						}
					}}
					placeholder="Case title"
					aria-invalid={Boolean(titleError) || undefined}
					disabled={readOnly}
					rows={1}
					className="-mx-2 min-h-0 resize-none overflow-hidden rounded-lg border-transparent bg-transparent px-2 py-1 text-2xl leading-tight font-semibold tracking-tight shadow-none hover:bg-muted focus-visible:bg-background disabled:cursor-not-allowed disabled:opacity-70 md:text-3xl"
				/>
				{titleError && <FieldError>{titleError}</FieldError>}
			</Field>

			<section className="mt-7 grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-5">
				<Field>
					<FieldLabel>Owner</FieldLabel>
					<Select
						items={[
							{ value: "unassigned", label: "Unassigned" },
							...members.map((member) => ({
								value: member._id,
								label: member.name,
							})),
						]}
						value={form.ownerMemberId ?? "unassigned"}
						disabled={readOnly}
						onValueChange={(value) =>
							setForm((current) => ({
								...current,
								ownerMemberId:
									value === "unassigned"
										? null
										: (value as Id<"organizationMembers">),
							}))
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="unassigned">Unassigned</SelectItem>
							{members.map((member) => (
								<SelectItem key={member._id} value={member._id}>
									{member.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
				<CaseDeadlineField
					value={form.dueDate}
					disabled={readOnly}
					onChange={(dueDate) =>
						setForm((current) => ({ ...current, dueDate }))
					}
				/>
				<Field>
					<FieldLabel>Status</FieldLabel>
					<Select
						items={CASE_STATUS_SELECT_ITEMS}
						value={form.status}
						disabled={readOnly}
						onValueChange={(value) => {
							if (value) {
								setForm((current) => ({
									...current,
									status: value,
								}));
							}
						}}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CASE_STATUS_OPTIONS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									<CaseStatusDot status={option.value} />
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
			</section>

			<section className="mt-7">
				<Field data-invalid={Boolean(descriptionError) || undefined}>
					<FieldLabel htmlFor="case-description">Description</FieldLabel>
					<CaseDescriptionEditor
						value={form.description}
						onChange={(description) =>
							setForm((current) => ({
								...current,
								description,
							}))
						}
						invalid={Boolean(descriptionError)}
						readOnly={readOnly}
					/>
					{descriptionError && <FieldError>{descriptionError}</FieldError>}
				</Field>
			</section>
		</header>
	);
}

function SaveStatus({
	state,
	onRetry,
}: {
	state: SaveState;
	onRetry: () => void;
}) {
	if (state.kind === "error") {
		return (
			<div
				className="flex min-w-0 items-center gap-1.5 text-xs text-destructive"
				aria-live="polite"
			>
				<IconAlertCircle className="size-3.5 shrink-0" />
				<span className="max-w-64 truncate" title={state.message}>
					Not saved
				</span>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={onRetry}
					className="h-7 px-2 text-destructive hover:text-destructive"
				>
					Retry
				</Button>
			</div>
		);
	}

	return (
		<div
			className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
			aria-live="polite"
		>
			{state.kind === "saving" ? (
				<>
					<IconLoader2 className="size-3.5 animate-spin" />
					<span>Saving</span>
				</>
			) : state.kind === "dirty" ? (
				<span>Unsaved changes</span>
			) : (
				<span className="inline-flex items-center gap-1.5 text-accent">
					<IconCheck className="size-3.5" />
					<span>Saved</span>
				</span>
			)}
		</div>
	);
}

function caseToForm(caseRecord: Doc<"cases">) {
	return {
		title: caseRecord.title,
		description: caseRecord.description,
		ownerMemberId: caseRecord.ownerMemberId,
		dueDate: caseRecord.dueAt === null ? "" : formatDateInput(caseRecord.dueAt),
		status: caseRecord.status,
	};
}

function parseEditableCaseFields(form: CaseForm) {
	return v.safeParse(editableCaseFieldsSchema, form);
}

function formsMatch(left: CaseForm, right: CaseForm) {
	return formSignature(left) === formSignature(right);
}

function formSignature(form: CaseForm) {
	return [
		form.title,
		form.description,
		form.ownerMemberId ?? "",
		form.dueDate,
		form.status,
	].join("\u0000");
}
