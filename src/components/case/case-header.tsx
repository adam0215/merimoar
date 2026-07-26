import {
	IconCalendar,
	IconCheck,
	IconClock,
	IconLoader2,
	IconPencil,
	IconUser,
} from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import * as v from "valibot";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
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
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { formatShortDate } from "./format.ts";
import type { CaseDetail } from "./types.ts";

export function CaseHeader({
	detail,
	members,
}: {
	detail: CaseDetail;
	members: Doc<"organizationMembers">[];
}) {
	const updateCase = useMutation(api.case.mutations.update);
	const [editing, setEditing] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [form, setForm] = useState(() => caseToForm(detail.case));

	useEffect(() => {
		if (!editing) {
			setForm(caseToForm(detail.case));
		}
	}, [detail.case, editing]);

	const titleValidation = useMemo(
		() =>
			v.safeParse(
				v.pipe(
					v.string(),
					v.trim(),
					v.minLength(2, "Use at least 2 characters."),
					v.maxLength(160, "Use no more than 160 characters."),
				),
				form.title,
			),
		[form.title],
	);

	async function save() {
		if (!titleValidation.success) {
			return;
		}

		setIsSaving(true);
		setError(null);
		const owner = members.find((member) => member._id === form.ownerMemberId);

		try {
			await updateCase({
				caseId: detail.case._id,
				title: titleValidation.output,
				description: form.description.trim(),
				ownerMemberId: owner?._id ?? null,
				dueAt: form.dueDate
					? new Date(`${form.dueDate}T12:00:00`).getTime()
					: null,
				status: form.status,
			});
			setEditing(false);
		} catch (caughtError) {
			setError(getConvexErrorMessage(caughtError));
		} finally {
			setIsSaving(false);
		}
	}

	if (editing) {
		return (
			<section className="rounded-2xl border bg-muted/20 p-4 md:p-5">
				<FieldGroup>
					<Field data-invalid={!titleValidation.success || undefined}>
						<FieldLabel htmlFor="edit-case-title">Title</FieldLabel>
						<Input
							id="edit-case-title"
							value={form.title}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									title: event.target.value,
								}))
							}
							autoFocus
						/>
						{!titleValidation.success && (
							<FieldError>{titleValidation.issues[0]?.message}</FieldError>
						)}
					</Field>
					<div className="grid gap-5 sm:grid-cols-3">
						<Field>
							<FieldLabel>Owner</FieldLabel>
							<Select
								value={form.ownerMemberId}
								onValueChange={(value) =>
									setForm((current) => ({
										...current,
										ownerMemberId: value,
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
						<Field>
							<FieldLabel htmlFor="edit-case-deadline">Deadline</FieldLabel>
							<Input
								id="edit-case-deadline"
								type="date"
								value={form.dueDate}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										dueDate: event.target.value,
									}))
								}
							/>
						</Field>
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
									<SelectItem value="open">Open</SelectItem>
									<SelectItem value="closed">Closed</SelectItem>
								</SelectContent>
							</Select>
						</Field>
					</div>
					<Field>
						<FieldLabel htmlFor="edit-case-description">Description</FieldLabel>
						<Textarea
							id="edit-case-description"
							value={form.description}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									description: event.target.value,
								}))
							}
							className="min-h-24"
						/>
					</Field>
					{error && (
						<p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
							{error}
						</p>
					)}
					<div className="flex justify-end gap-2">
						<Button
							variant="ghost"
							onClick={() => setEditing(false)}
							disabled={isSaving}
						>
							Cancel
						</Button>
						<Button onClick={save} disabled={isSaving}>
							{isSaving ? (
								<IconLoader2 className="animate-spin" />
							) : (
								<IconCheck />
							)}
							Save
						</Button>
					</div>
				</FieldGroup>
			</section>
		);
	}

	return (
		<header>
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<p className="text-xs font-medium tracking-wide text-muted-foreground">
							{detail.case.reference}
						</p>
						<Badge
							variant="outline"
							className={cn(
								"h-5 px-2 text-[11px]",
								detail.case.status === "open"
									? "border-accent bg-accent/10 text-accent"
									: "text-muted-foreground",
							)}
						>
							{detail.case.status === "open" ? "Open" : "Closed"}
						</Badge>
					</div>
					<h1 className="mt-2 max-w-3xl text-2xl font-semibold tracking-tight">
						{detail.case.title}
					</h1>
				</div>
				<Button variant="outline" size="sm" onClick={() => setEditing(true)}>
					<IconPencil />
					Edit
				</Button>
			</div>

			<div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
				<span className="inline-flex items-center gap-1.5">
					<IconUser className="size-4" />
					{detail.owner?.name ?? "Unassigned"}
				</span>
				<span className="inline-flex items-center gap-1.5">
					<IconCalendar className="size-4" />
					{detail.case.dueAt
						? `Due ${formatShortDate(detail.case.dueAt)}`
						: "No deadline"}
				</span>
				<span className="inline-flex items-center gap-1.5">
					<IconClock className="size-4" />
					Updated {formatShortDate(detail.case.lastActivityAt)}
				</span>
			</div>

			{detail.case.description ? (
				<p className="mt-5 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
					{detail.case.description}
				</p>
			) : (
				<p className="mt-5 text-sm italic text-muted-foreground">
					No description.
				</p>
			)}
		</header>
	);
}

function caseToForm(caseRecord: Doc<"cases">) {
	return {
		title: caseRecord.title,
		description: caseRecord.description,
		ownerMemberId: caseRecord.ownerMemberId ?? "unassigned",
		dueDate: caseRecord.dueAt
			? new Date(caseRecord.dueAt).toISOString().slice(0, 10)
			: "",
		status: caseRecord.status,
	};
}
