import { api } from "@merimoar/convex/api";
import type { Id } from "@merimoar/convex/data-model";
import { IconLoader2, IconTrash } from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { useState } from "react";
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
import { Input } from "#/components/ui/input.tsx";

export function RemoveEmailInboxDialog({
	inboxId,
	displayName,
	address,
}: {
	inboxId: Id<"emailInboxes">;
	displayName: string;
	address: string;
}) {
	const removeInbox = useMutation(api.email.inboxes.remove);
	const [open, setOpen] = useState(false);
	const [confirmation, setConfirmation] = useState("");
	const [submissionError, setSubmissionError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const canSubmit = confirmation === address;

	function handleOpenChange(nextOpen: boolean) {
		if (nextOpen) {
			setConfirmation("");
			setSubmissionError(null);
			setIsSubmitting(false);
		}
		setOpen(nextOpen);
	}

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!canSubmit) {
			return;
		}

		setIsSubmitting(true);
		setSubmissionError(null);
		try {
			await removeInbox({ inboxId });
			setOpen(false);
		} catch (error) {
			setSubmissionError(
				error instanceof Error
					? error.message
					: "The inbox could not be removed.",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger
				render={
					<Button
						variant="ghost"
						size="icon-sm"
						className="text-muted-foreground hover:text-destructive"
						aria-label={`Remove ${displayName}`}
					/>
				}
			>
				<IconTrash />
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Remove inbox</DialogTitle>
					<DialogDescription>
						New email will no longer be routed to {displayName}. Existing email
						is preserved.
					</DialogDescription>
				</DialogHeader>

				<form id="remove-email-inbox" onSubmit={submit}>
					<label
						htmlFor="remove-email-inbox-confirmation"
						className="text-sm font-medium"
					>
						Type <span className="break-all text-foreground">{address}</span> to
						confirm
					</label>
					<Input
						id="remove-email-inbox-confirmation"
						className="mt-2"
						value={confirmation}
						onChange={(event) => {
							setConfirmation(event.target.value);
							setSubmissionError(null);
						}}
						autoComplete="off"
						autoFocus
					/>
					{submissionError && (
						<p className="mt-2 text-sm text-destructive">{submissionError}</p>
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
						form="remove-email-inbox"
						variant="destructive"
						disabled={!canSubmit || isSubmitting}
					>
						{isSubmitting && <IconLoader2 className="animate-spin" />}
						Remove inbox
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
