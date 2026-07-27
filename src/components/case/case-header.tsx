import {
	IconAlertCircle,
	IconCalendar,
	IconCheck,
	IconClock,
	IconLoader2,
} from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { sv } from "date-fns/locale";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as v from "valibot";
import { Button } from "#/components/ui/button.tsx";
import { Calendar } from "#/components/ui/calendar.tsx";
import { Field, FieldError, FieldLabel } from "#/components/ui/field.tsx";
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
import { Textarea } from "#/components/ui/textarea.tsx";
import { showAppNotification } from "#/lib/app-notifications.ts";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";
import { formatDateInput, parseDateInput } from "#/lib/date-input.ts";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
	caseDescriptionSchema,
	caseTitleSchema,
} from "../../../convex/case/input";
import { formatShortDate } from "./format.ts";
import type { CaseCreateOptions, CaseDetail } from "./types.ts";

const editableCaseFieldsSchema = v.object({
	title: caseTitleSchema,
	description: caseDescriptionSchema,
});

type CaseForm = ReturnType<typeof caseToForm>;

type SaveState =
	| { kind: "saved" }
	| { kind: "dirty" }
	| { kind: "saving" }
	| { kind: "error"; message: string };

export function CaseHeader({
	detail,
	members,
}: {
	detail: CaseDetail;
	members: CaseCreateOptions["members"];
}) {
	const updateCase = useMutation(api.case.mutations.update);
	const initialForm = useMemo(() => caseToForm(detail.case), [detail.case]);
	const [form, setForm] = useState(initialForm);
	const [saveState, setSaveState] = useState<SaveState>({ kind: "saved" });
	const latestFormRef = useRef(form);
	const lastSavedFormRef = useRef(form);
	const lastQueuedSignatureRef = useRef<string | null>(null);
	const saveChainRef = useRef(Promise.resolve());
	const isMountedRef = useRef(true);

	const validation = useMemo(
		() =>
			v.safeParse(editableCaseFieldsSchema, {
				title: form.title,
				description: form.description,
			}),
		[form.description, form.title],
	);

	useEffect(() => {
		latestFormRef.current = form;
	}, [form]);

	useEffect(() => {
		const serverForm = caseToForm(detail.case);
		if (
			formsMatch(latestFormRef.current, lastSavedFormRef.current) &&
			!formsMatch(serverForm, lastSavedFormRef.current)
		) {
			latestFormRef.current = serverForm;
			lastSavedFormRef.current = serverForm;
			lastQueuedSignatureRef.current = formSignature(serverForm);
			setForm(serverForm);
			setSaveState({ kind: "saved" });
		}
	}, [detail.case]);

	const queueSave = useCallback(
		(snapshot: CaseForm) => {
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

				const snapshotValidation = v.safeParse(editableCaseFieldsSchema, {
					title: snapshot.title,
					description: snapshot.description,
				});
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
						showAppNotification({
							title: `${detail.case.reference} was not saved`,
							description: message,
						});
					}
				}
			});
		},
		[detail.case._id, detail.case.reference, updateCase],
	);

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
			const pendingForm = latestFormRef.current;
			const pendingValidation = v.safeParse(editableCaseFieldsSchema, {
				title: pendingForm.title,
				description: pendingForm.description,
			});
			if (
				pendingValidation.success &&
				!formsMatch(pendingForm, lastSavedFormRef.current)
			) {
				queueSave(pendingForm);
			}
		};
	}, [queueSave]);

	useEffect(() => {
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
	}, [form, queueSave, validation]);

	function retrySave() {
		if (!validation.success) {
			return;
		}
		lastQueuedSignatureRef.current = null;
		queueSave(latestFormRef.current);
	}

	const titleError = !validation.success
		? validation.issues.find((issue) => issue.path?.[0]?.key === "title")
				?.message
		: undefined;
	const descriptionError = !validation.success
		? validation.issues.find((issue) => issue.path?.[0]?.key === "description")
				?.message
		: undefined;
	const formattedDescriptionLength = useLocalizedNumber(
		form.description.length,
	);

	return (
		<header>
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
				</div>
				<SaveStatus state={saveState} onRetry={retrySave} />
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
					rows={1}
					className="-mx-2 min-h-0 resize-none overflow-hidden rounded-lg border-transparent bg-transparent px-2 py-1 text-2xl leading-tight font-semibold tracking-tight shadow-none hover:bg-muted/40 focus-visible:bg-background md:text-3xl"
				/>
				{titleError && <FieldError>{titleError}</FieldError>}
			</Field>

			<section className="mt-7 grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-5">
				<Field>
					<FieldLabel>Owner</FieldLabel>
					<Select
						value={form.ownerMemberId ?? "unassigned"}
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
				<DeadlineField
					value={form.dueDate}
					onChange={(dueDate) =>
						setForm((current) => ({ ...current, dueDate }))
					}
				/>
				<Field>
					<FieldLabel>Status</FieldLabel>
					<Select
						value={form.status}
						onValueChange={(value) =>
							setForm((current) => ({
								...current,
								status: value === "closed" ? "closed" : "open",
							}))
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="open">
								<StatusDot status="open" />
								Open
							</SelectItem>
							<SelectItem value="closed">
								<StatusDot status="closed" />
								Closed
							</SelectItem>
						</SelectContent>
					</Select>
				</Field>
			</section>

			<section className="mt-7">
				<Field data-invalid={Boolean(descriptionError) || undefined}>
					<div className="flex items-baseline justify-between gap-4">
						<FieldLabel htmlFor="case-description">Description</FieldLabel>
						<span className="text-xs tabular-nums text-muted-foreground">
							{formattedDescriptionLength} / 4,000
						</span>
					</div>
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
						aria-invalid={Boolean(descriptionError) || undefined}
						className="min-h-40 resize-y bg-background px-4 py-3.5 leading-6 md:min-h-48"
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

function StatusDot({ status }: { status: CaseForm["status"] }) {
	return (
		<span
			className={
				status === "open"
					? "size-2 shrink-0 rounded-full bg-accent"
					: "size-2 shrink-0 rounded-full bg-muted-foreground/40"
			}
		/>
	);
}

function DeadlineField({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const timestamp = value ? parseDateInput(value) : Number.NaN;
	const selectedDate = Number.isFinite(timestamp)
		? new Date(timestamp)
		: undefined;
	const calendarLocale = useBrowserCalendarLocale();

	return (
		<Field>
			<FieldLabel>Deadline</FieldLabel>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						type="button"
						variant="outline"
						className="w-full justify-start text-left font-normal"
					>
						<IconCalendar />
						{selectedDate
							? selectedDate.toLocaleDateString(undefined, {
									year: "numeric",
									month: "long",
									day: "numeric",
								})
							: "Select date"}
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-auto gap-0 p-0">
					<Calendar
						mode="single"
						selected={selectedDate}
						locale={calendarLocale}
						onSelect={(date) => {
							if (!date) {
								return;
							}
							onChange(formatDateInput(date.getTime()));
							setOpen(false);
						}}
					/>
					{selectedDate && (
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

function useBrowserCalendarLocale() {
	const [locale, setLocale] = useState<typeof sv | undefined>();

	useEffect(() => {
		setLocale(navigator.language.startsWith("sv") ? sv : undefined);
	}, []);

	return locale;
}

function useLocalizedNumber(value: number) {
	const [localizedValue, setLocalizedValue] = useState(String(value));

	useEffect(() => {
		setLocalizedValue(new Intl.NumberFormat(navigator.language).format(value));
	}, [value]);

	return localizedValue;
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
