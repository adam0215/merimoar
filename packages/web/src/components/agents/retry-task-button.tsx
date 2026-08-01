import { api } from "@merimoar/convex/api";
import type { Id } from "@merimoar/convex/data-model";
import { IconLoader, IconReload } from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import { showAppNotification } from "#/lib/app-notifications.ts";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";

export function RetryTaskButton({ taskId }: { taskId: Id<"agentTasks"> }) {
	const retryTask = useMutation(api.agent.tasks.retry);
	const [isRetrying, setIsRetrying] = useState(false);

	async function handleRetry() {
		if (isRetrying) return;
		setIsRetrying(true);
		try {
			await retryTask({ taskId });
		} catch (error) {
			showAppNotification({
				title: "Could not retry the task",
				description: getConvexErrorMessage(error),
			});
		} finally {
			setIsRetrying(false);
		}
	}

	return (
		<Button
			size="sm"
			disabled={isRetrying}
			aria-busy={isRetrying}
			onClick={() => void handleRetry()}
		>
			{isRetrying ? <IconLoader className="animate-spin" /> : <IconReload />}
			Retry
		</Button>
	);
}
