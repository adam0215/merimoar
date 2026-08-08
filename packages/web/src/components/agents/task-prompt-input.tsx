import { api } from "@merimoar/convex/api";
import type { Id } from "@merimoar/convex/data-model";
import { IconArrowUp, IconLoader } from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { useState } from "react";
import type { AgentTaskStatus } from "#/components/agents/agent-types.ts";
import { Button } from "#/components/ui/button.tsx";
import { toast } from "#/components/ui/toast.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";

export function TaskPromptInput({
	taskId,
	taskStatus,
}: {
	taskId: Id<"agentTasks">;
	taskStatus: AgentTaskStatus;
}) {
	const sendMessage = useMutation(api.agent.tasks.sendMessage);
	const [value, setValue] = useState("");
	const [isSending, setIsSending] = useState(false);
	const canSend =
		taskStatus !== "waiting_for_approval" && taskStatus !== "cancelled";

	async function handleSend() {
		const input = value.trim();
		if (!canSend || !input || isSending) return;
		setIsSending(true);
		try {
			await sendMessage({ taskId, input });
			setValue("");
		} catch (error) {
			toast.add({
				title: "Could not send the message",
				description: getConvexErrorMessage(error),
				type: "error",
			});
		} finally {
			setIsSending(false);
		}
	}

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				void handleSend();
			}}
			aria-label="Add an instruction to this task"
			className="relative flex flex-col overflow-hidden rounded-2xl bg-popover/60 text-popover-foreground shadow-2xl ring-1 ring-foreground/5 backdrop-blur-sm backdrop-saturate-150 focus-within:ring-foreground/10 dark:ring-foreground/10"
		>
			<div className="px-4 pt-4 pb-2">
				<textarea
					rows={1}
					name="instruction"
					value={value}
					placeholder="Tell the agent something…"
					aria-label="Instruction"
					disabled={!canSend || isSending}
					onChange={(event) => setValue(event.currentTarget.value)}
					onKeyDown={(event) => {
						if (event.nativeEvent.isComposing) return;
						if (event.key === "Enter" && !event.shiftKey) {
							event.preventDefault();
							event.currentTarget.form?.requestSubmit();
						}
					}}
					className="field-sizing-content block min-h-6 max-h-120 w-full resize-none overflow-y-auto bg-transparent text-sm leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
				/>
			</div>
			<div className="flex min-h-12 items-center justify-end px-3 py-2">
				<Button
					type="submit"
					size="icon-sm"
					disabled={!canSend || isSending || value.trim().length === 0}
					aria-label="Send instruction"
					aria-busy={isSending}
					className="bg-accent text-accent-foreground hover:bg-accent/80"
				>
					{isSending ? (
						<IconLoader className="animate-spin" />
					) : (
						<IconArrowUp className="text-accent-foreground" />
					)}
				</Button>
			</div>
		</form>
	);
}
