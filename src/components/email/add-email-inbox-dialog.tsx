import {
	IconCheck,
	IconInbox,
	IconLoader2,
	IconPlus,
} from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { useMemo, useState } from "react";
import * as v from "valibot";
import { Button } from "#/components/ui/button.tsx";
import {
	Dialog,
	DialogClose,
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
import { getConvexErrorMessage } from "#/lib/convex-error.ts";
import { api } from "../../../convex/_generated/api";
import {
	emailInboxAddressSchema,
	emailInboxDetailsSchema,
	emailInboxNameSchema,
} from "../../../convex/email/input";

type FieldName = keyof v.InferInput<typeof emailInboxDetailsSchema>;

const initialForm = {
	displayName: "",
	address: "",
};

export function AddEmailInboxDialog() {
	const createInbox = useMutation(api.email.inboxes.create);
	const [open, setOpen] = useState(false);
	const [createdAddress, setCreatedAddress] = useState<string>();
	const [form, setForm] = useState(initialForm);
	const [dirtyFields, setDirtyFields] = useState<Set<FieldName>>(new Set());
	const [submissionError, setSubmissionError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const validation = useMemo(
		() => ({
			displayName: v.safeParse(emailInboxNameSchema, form.displayName),
			address: v.safeParse(emailInboxAddressSchema, form.address),
			form: v.safeParse(emailInboxDetailsSchema, form),
		}),
		[form],
	);

	function reset() {
		setCreatedAddress(undefined);
		setForm(initialForm);
		setDirtyFields(new Set());
		setSubmissionError(null);
		setIsSubmitting(false);
	}

	function handleOpenChange(nextOpen: boolean) {
		if (nextOpen) {
			reset();
		}
		setOpen(nextOpen);
	}

	function updateField(field: FieldName, value: string) {
		setForm((current) => ({ ...current, [field]: value }));
		setDirtyFields((current) => new Set(current).add(field));
		setSubmissionError(null);
	}

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setDirtyFields(new Set(["displayName", "address"]));
		if (!validation.form.success) {
			return;
		}

		setIsSubmitting(true);
		setSubmissionError(null);
		try {
			await createInbox(validation.form.output);
			setCreatedAddress(validation.form.output.address);
		} catch (error) {
			setSubmissionError(
				getConvexErrorMessage(error, "The inbox could not be created."),
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	function fieldIsInvalid(field: FieldName) {
		return dirtyFields.has(field) && !validation[field].success;
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger render={<Button />}>
				<IconPlus />
				Add inbox
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				{createdAddress ? (
					<div className="flex flex-col items-center px-4 py-8 text-center">
						<div className="flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
							<IconCheck className="size-6" />
						</div>
						<DialogHeader className="mt-5 items-center">
							<DialogTitle>Inbox created</DialogTitle>
							<DialogDescription>{createdAddress}</DialogDescription>
						</DialogHeader>
						<DialogClose render={<Button className="mt-6" />}>Done</DialogClose>
					</div>
				) : (
					<>
						<DialogHeader>
							<div className="mb-2 flex size-10 items-center justify-center rounded-full bg-muted">
								<IconInbox className="size-5" />
							</div>
							<DialogTitle>Add inbox</DialogTitle>
							<DialogDescription>
								Create a destination for incoming email.
							</DialogDescription>
						</DialogHeader>

						<form id="add-email-inbox" onSubmit={submit} noValidate>
							<FieldGroup>
								<Field
									data-invalid={fieldIsInvalid("displayName") || undefined}
								>
									<FieldLabel htmlFor="inbox-name">Inbox name</FieldLabel>
									<Input
										id="inbox-name"
										value={form.displayName}
										placeholder="Support"
										onChange={(event) =>
											updateField("displayName", event.target.value)
										}
										aria-invalid={fieldIsInvalid("displayName") || undefined}
										autoComplete="off"
										autoFocus
									/>
									{fieldIsInvalid("displayName") && (
										<FieldError>
											{validation.displayName.issues?.[0]?.message}
										</FieldError>
									)}
								</Field>

								<Field data-invalid={fieldIsInvalid("address") || undefined}>
									<FieldLabel htmlFor="inbox-address">Email address</FieldLabel>
									<Input
										id="inbox-address"
										type="email"
										placeholder="support@your-domain.com"
										value={form.address}
										onChange={(event) =>
											updateField("address", event.target.value)
										}
										aria-invalid={fieldIsInvalid("address") || undefined}
										autoComplete="email"
									/>
									<FieldDescription>
										Matching incoming email is routed to this inbox.
									</FieldDescription>
									{fieldIsInvalid("address") && (
										<FieldError>
											{validation.address.issues?.[0]?.message}
										</FieldError>
									)}
								</Field>
							</FieldGroup>

							{submissionError && (
								<p className="mt-4 text-sm text-destructive">
									{submissionError}
								</p>
							)}
						</form>

						<DialogFooter>
							<DialogClose
								render={<Button variant="ghost" disabled={isSubmitting} />}
							>
								Cancel
							</DialogClose>
							<Button
								type="submit"
								form="add-email-inbox"
								disabled={isSubmitting}
							>
								{isSubmitting ? (
									<IconLoader2 className="animate-spin" />
								) : (
									<IconPlus />
								)}
								Add inbox
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
