import { IconLoader2 } from "@tabler/icons-react";
import type { ReactNode } from "react";
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

export function DeleteConfirmationDialog({
	open,
	onOpenChange,
	title,
	description,
	actionLabel,
	isDeleting,
	onConfirm,
	error,
	footerClassName,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: ReactNode;
	description: ReactNode;
	actionLabel: string;
	isDeleting: boolean;
	onConfirm: () => void;
	error?: string | null;
	footerClassName?: string;
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>

				{error && (
					<p className="text-sm text-destructive" role="alert">
						{error}
					</p>
				)}

				<AlertDialogFooter className={footerClassName}>
					<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={isDeleting}
						onClick={onConfirm}
					>
						{isDeleting && <IconLoader2 className="animate-spin" />}
						{actionLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
