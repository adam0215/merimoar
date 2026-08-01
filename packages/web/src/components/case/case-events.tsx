import { api } from "@merimoar/convex/api";
import { caseEventBodySchema } from "@merimoar/convex/case/input";
import type { Id } from "@merimoar/convex/data-model";
import {
	IconAsterisk,
	IconCheck,
	IconLoader2,
	IconMail,
	IconPlus,
	IconRefresh,
	IconX,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import * as v from "valibot";
import { formatAgentTaskLabel } from "#/components/agents/agent-task-label.ts";
import { useCurrentCaseInteractionPolicy } from "#/components/case/case-interaction-policy.tsx";
import type { CaseDetail } from "#/components/case/types.ts";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";
import { formatDateTime } from "#/lib/date-format.ts";

export function CaseEvents({
	caseId,
	events,
}: {
	caseId: Id<"cases">;
	events: CaseDetail["events"];
}) {
	const addEvent = useMutation(api.case.mutations.addEvent);
	const { readOnly, readOnlyReason } = useCurrentCaseInteractionPolicy();
	const [composerOpen, setComposerOpen] = useState(false);
	const [body, setBody] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (readOnly) {
			setComposerOpen(false);
			setBody("");
			setError(null);
			return;
		}
		if (composerOpen) {
			inputRef.current?.focus();
		}
	}, [composerOpen, readOnly]);

	async function submit() {
		if (readOnly) return;
		const result = v.safeParse(caseEventBodySchema, body);

		if (!result.success) {
			setError(result.issues[0]?.message ?? "Write an event first.");
			return;
		}

		setIsSubmitting(true);
		setError(null);

		try {
			await addEvent({ caseId, body: result.output });
			setBody("");
		} catch (caughtError) {
			setError(getConvexErrorMessage(caughtError));
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<section className="mt-10 border-t pt-8">
			<div className="flex items-center justify-between gap-4">
				<h2 className="text-sm font-semibold">Events</h2>
				<Button
					variant="secondary"
					size="sm"
					disabled={readOnly}
					title={readOnly ? readOnlyReason : undefined}
					onClick={() => setComposerOpen(true)}
				>
					<IconPlus />
					Add event
				</Button>
			</div>

			{composerOpen && (
				<div className="mt-3">
					<div className="flex items-center gap-2 rounded-xl border bg-muted p-2">
						<Input
							ref={inputRef}
							value={body}
							disabled={readOnly}
							onChange={(event) => {
								setBody(event.target.value);
								setError(null);
							}}
							onKeyDown={(event) => {
								if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
									event.preventDefault();
									void submit();
								}
								if (event.key === "Escape") {
									setComposerOpen(false);
									setBody("");
									setError(null);
								}
							}}
							placeholder="Write an event…  ⌘ Enter to add"
							className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-0"
						/>
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={() => {
								setComposerOpen(false);
								setBody("");
								setError(null);
							}}
							disabled={readOnly || isSubmitting}
							aria-label="Cancel"
							title="Cancel"
						>
							<IconX />
						</Button>
						<Button
							size="icon-sm"
							onClick={submit}
							disabled={readOnly || isSubmitting}
							aria-label="Add event"
							title="Add event"
						>
							{isSubmitting ? (
								<IconLoader2 className="animate-spin" />
							) : (
								<IconCheck />
							)}
						</Button>
					</div>
					{error && (
						<p className="mt-1.5 text-xs text-destructive" role="alert">
							{error}
						</p>
					)}
				</div>
			)}

			<div className="relative mt-4">
				{events.map(({ event, author, emailMessage }, index) => (
					<article
						key={event._id}
						className="relative flex gap-3 pb-6 last:pb-0"
					>
						<div className="relative w-4 shrink-0">
							{index < events.length - 1 && (
								<span
									className="absolute top-6 -bottom-6 left-1/2 w-px -translate-x-1/2 rounded-full bg-border"
									aria-hidden="true"
								/>
							)}
							{"type" in event &&
							(event.type === "inbound_email" ||
								event.type === "outbound_email") ? (
								<IconMail className="relative z-1 mt-1 size-4 text-accent" />
							) : "type" in event && event.type === "system_change" ? (
								<IconRefresh className="relative z-1 mt-1 size-4 text-muted-foreground" />
							) : (
								<IconAsterisk
									className="relative z-1 mt-1 size-4 text-accent"
									stroke={2.25}
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							)}
						</div>
						<div className="min-w-0">
							{"type" in event &&
							(event.type === "inbound_email" ||
								event.type === "outbound_email") ? (
								<>
									<p className="max-w-3xl text-sm leading-6">
										{event.type === "inbound_email"
											? "Inbound email"
											: "Outbound email"}
										{emailMessage
											? event.type === "inbound_email"
												? ` from ${emailMessage.from.name || emailMessage.from.address}`
												: ` to ${emailMessage.to[0]?.name || emailMessage.to[0]?.address || "recipient"}`
											: ""}
									</p>
									{emailMessage && (
										<Link
											to="/email"
											search={{ thread: emailMessage.threadId }}
											className="mt-0.5 block max-w-3xl truncate text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
										>
											{emailMessage.subject || "(No subject)"}
										</Link>
									)}
								</>
							) : (
								<p className="max-w-3xl whitespace-pre-wrap text-sm leading-6">
									{event.body}
								</p>
							)}
							<p className="mt-1 inline-flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
								<span>{formatDateTime(event.occurredAt)}</span>
								{author && (
									<>
										<span className="size-1 rounded-full bg-border" />
										<span>{author.name}</span>
									</>
								)}
								{"type" in event &&
									(event.type === "agent_note" ||
										event.type === "agent_change") && (
										<>
											<span className="size-1 rounded-full bg-border" />
											<Link
												to="/agents"
												search={{ view: "tasks", task: event.agentTaskId }}
												title={event.agentTaskId}
												className="font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
											>
												{formatAgentTaskLabel(event.agentTaskId)}
											</Link>
										</>
									)}
							</p>
						</div>
					</article>
				))}
				{events.length === 0 && (
					<p className="pb-1 text-sm text-muted-foreground">
						No events recorded yet.
					</p>
				)}
			</div>
		</section>
	);
}
