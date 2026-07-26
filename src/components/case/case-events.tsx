import { IconLoader2, IconPlus, IconTimelineEvent } from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import * as v from "valibot";
import { Button } from "#/components/ui/button.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { formatEventDate } from "./format.ts";
import type { CaseDetail } from "./types.ts";

export function CaseEvents({
	caseId,
	events,
}: {
	caseId: Id<"cases">;
	events: CaseDetail["events"];
}) {
	const addEvent = useMutation(api.case.mutations.addEvent);
	const [composerOpen, setComposerOpen] = useState(false);
	const [body, setBody] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (composerOpen) {
			textareaRef.current?.focus();
		}
	}, [composerOpen]);

	async function submit() {
		const result = v.safeParse(
			v.pipe(
				v.string(),
				v.trim(),
				v.minLength(1, "Write an event first."),
				v.maxLength(4000, "Use no more than 4,000 characters."),
			),
			body,
		);

		if (!result.success) {
			setError(result.issues[0]?.message ?? "Write an event first.");
			return;
		}

		setIsSubmitting(true);
		setError(null);

		try {
			await addEvent({ caseId, body: result.output });
			setBody("");
			requestAnimationFrame(() => textareaRef.current?.focus());
		} catch (caughtError) {
			setError(getConvexErrorMessage(caughtError));
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<section className="mt-8">
			<div className="flex items-center justify-between gap-4">
				<div>
					<h2 className="text-sm font-semibold">Events</h2>
					<p className="mt-1 text-xs text-muted-foreground">
						A fast, chronological record of what has happened.
					</p>
				</div>
				<Button variant="ghost" size="sm" onClick={() => setComposerOpen(true)}>
					<IconPlus />
					Add event
				</Button>
			</div>

			{composerOpen && (
				<div className="mt-3 rounded-xl border bg-muted/20 p-3">
					<Textarea
						ref={textareaRef}
						value={body}
						onChange={(event) => {
							setBody(event.target.value);
							setError(null);
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
								event.preventDefault();
								void submit();
							}
							if (event.key === "Escape" && body.length === 0) {
								setComposerOpen(false);
							}
						}}
						placeholder="Write an event…"
						className="min-h-20 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
					/>
					<div className="mt-2 flex items-center justify-between gap-3">
						<div>
							{error ? (
								<p className="text-xs text-destructive">{error}</p>
							) : (
								<p className="text-xs text-muted-foreground">
									Press ⌘ Enter to add
								</p>
							)}
						</div>
						<div className="flex gap-2">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => {
									setComposerOpen(false);
									setBody("");
									setError(null);
								}}
								disabled={isSubmitting}
							>
								Cancel
							</Button>
							<Button size="sm" onClick={submit} disabled={isSubmitting}>
								{isSubmitting ? (
									<IconLoader2 className="animate-spin" />
								) : (
									<IconTimelineEvent />
								)}
								Add event
							</Button>
						</div>
					</div>
				</div>
			)}

			<div className="relative mt-4 ml-2 border-l pl-5">
				{events.map(({ event, author }) => (
					<article key={event._id} className="relative pb-6 last:pb-0">
						<span className="absolute top-1.5 -left-[1.55rem] size-2 rounded-full bg-accent ring-4 ring-background" />
						<p className="max-w-3xl whitespace-pre-wrap text-sm leading-6">
							{event.body}
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							{formatEventDate(event.occurredAt)}
							{author ? ` · ${author.name}` : ""}
						</p>
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
