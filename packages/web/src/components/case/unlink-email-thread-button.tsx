import { api } from "@merimoar/convex/api";
import type { Id } from "@merimoar/convex/data-model";
import { IconAlertCircle, IconLoader2, IconX } from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import { showAppNotification } from "#/lib/app-notifications.ts";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";
import { cn } from "#/lib/utils.ts";

export function UnlinkEmailThreadButton({
	relationId,
	label,
	className,
}: {
	relationId: Id<"caseEmailThreadRelations">;
	label: string;
	className?: string;
}) {
	const unlinkEmailThread = useMutation(api.case.mutations.unlinkEmailThread);
	const [isUnlinking, setIsUnlinking] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function unlink() {
		if (isUnlinking) {
			return;
		}

		setIsUnlinking(true);
		setError(null);
		try {
			await unlinkEmailThread({ relationId });
		} catch (caughtError) {
			const message = getConvexErrorMessage(
				caughtError,
				"The email thread could not be unlinked.",
			);
			setError(message);
			showAppNotification({
				title: "Email thread could not be unlinked",
				description: message,
			});
		} finally {
			setIsUnlinking(false);
		}
	}

	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-sm"
			onClick={() => void unlink()}
			disabled={isUnlinking}
			className={cn("shrink-0", className)}
			aria-label={`${error ? "Retry unlinking" : "Unlink"} ${label}`}
			title={error ?? `Unlink ${label}`}
		>
			{isUnlinking ? (
				<IconLoader2 className="animate-spin" />
			) : error ? (
				<IconAlertCircle className="text-destructive" />
			) : (
				<IconX />
			)}
		</Button>
	);
}
