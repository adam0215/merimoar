import { api } from "@merimoar/convex/api";
import type { Doc } from "@merimoar/convex/data-model";
import { IconTrash } from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import { DeleteConfirmationDialog } from "#/components/ui/delete-confirmation-dialog.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";

export function DeleteEntityTypeDialog({
	entityType,
	onDeleted,
}: {
	entityType: Doc<"entityTypes">;
	onDeleted: () => void;
}) {
	const deleteType = useMutation(api.entity.mutations.deleteType);
	const [open, setOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function handleOpenChange(nextOpen: boolean) {
		if (isDeleting) return;
		setOpen(nextOpen);
		if (nextOpen) setError(null);
	}

	async function confirmDelete() {
		setIsDeleting(true);
		setError(null);

		try {
			await deleteType({ entityTypeId: entityType._id });
			setOpen(false);
			onDeleted();
		} catch (caughtError) {
			setError(
				getConvexErrorMessage(
					caughtError,
					"The entity type could not be deleted.",
				),
			);
		} finally {
			setIsDeleting(false);
		}
	}

	return (
		<>
			<Button
				variant="destructive-subtle"
				size="sm"
				onClick={() => setOpen(true)}
			>
				<IconTrash />
				Delete
			</Button>

			<DeleteConfirmationDialog
				open={open}
				onOpenChange={handleOpenChange}
				title={`Delete ${entityType.name}?`}
				description="The entity type, all of its fields, every entity belonging to it, and their case relationships will be permanently deleted. This cannot be undone."
				actionLabel="Delete entity type"
				isDeleting={isDeleting}
				onConfirm={() => void confirmDelete()}
				error={error}
			/>
		</>
	);
}
