import { IconDots, IconLoader2, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";

export function CaseActionsMenu({
	caseReference,
	disabled,
	onDelete,
}: {
	caseReference: string;
	disabled: boolean;
	onDelete: () => Promise<void>;
}) {
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	function handleDeleteDialogOpenChange(open: boolean) {
		if (isDeleting) return;
		setDeleteDialogOpen(open);
		if (open) setDeleteError(null);
	}

	async function confirmDelete() {
		setIsDeleting(true);
		setDeleteError(null);
		try {
			await onDelete();
			setDeleteDialogOpen(false);
		} catch (error) {
			setDeleteError(
				getConvexErrorMessage(error, "The case could not be deleted."),
			);
			setIsDeleting(false);
		}
	}

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Case actions"
							title="Case actions"
						/>
					}
				>
					<IconDots />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-48">
					<DropdownMenuItem
						variant="destructive"
						disabled={disabled}
						onClick={() => setDeleteDialogOpen(true)}
					>
						<IconTrash />
						Delete case
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog
				open={deleteDialogOpen}
				onOpenChange={handleDeleteDialogOpenChange}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete {caseReference}?</AlertDialogTitle>
						<AlertDialogDescription>
							The case and its history will be permanently deleted. Related
							contacts, entities, email threads, and other cases will be kept.
						</AlertDialogDescription>
					</AlertDialogHeader>
					{deleteError && (
						<p className="text-sm text-destructive" role="alert">
							{deleteError}
						</p>
					)}
					<AlertDialogFooter className="flex-col">
						<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={isDeleting}
							onClick={() => void confirmDelete()}
						>
							{isDeleting && <IconLoader2 className="animate-spin" />}
							Delete case
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
