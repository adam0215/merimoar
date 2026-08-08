import { api } from "@merimoar/convex/api";
import type { Id } from "@merimoar/convex/data-model";
import { IconPlayerStopFilled } from "@tabler/icons-react";
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
import { toast } from "#/components/ui/toast.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";

export function TakeOverTaskDialog({
	caseId,
	label = "Take over",
	iconOnly = false,
	variant = "secondary",
}: {
	caseId: Id<"cases">;
	label?: string;
	iconOnly?: boolean;
	variant?: "ghost" | "secondary";
}) {
	const takeOverCase = useMutation(api.agent.tasks.takeOverCase);
	const [isTakingOver, setIsTakingOver] = useState(false);

	async function handleTakeOver() {
		setIsTakingOver(true);
		try {
			await takeOverCase({ caseId });
		} catch (error) {
			toast.add({
				title: "Could not take over the case",
				description: getConvexErrorMessage(error),
				type: "error",
			});
		} finally {
			setIsTakingOver(false);
		}
	}

	return (
		<Dialog>
			<DialogTrigger
				render={
					<Button
						variant={iconOnly ? "secondary" : variant}
						size={iconOnly ? "icon-sm" : "sm"}
						className={iconOnly ? "text-foreground" : "px-2"}
						aria-label={iconOnly ? label : undefined}
						title={iconOnly ? label : undefined}
					/>
				}
			>
				{iconOnly && <IconPlayerStopFilled />}
				{!iconOnly && label}
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Stop the task and take over?</DialogTitle>
					<DialogDescription>
						The task will be cancelled and the case unlocked. Its activity
						history remains available.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<DialogClose render={<Button variant="secondary" />}>
						Keep delegated
					</DialogClose>
					<DialogClose
						render={
							<Button
								disabled={isTakingOver}
								onClick={() => void handleTakeOver()}
							/>
						}
					>
						Stop and take over
					</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
