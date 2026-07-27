import { IconCheck, IconLoader2, IconPlus, IconX } from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import * as v from "valibot";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { caseEventBodySchema } from "../../../convex/case/input";
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
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (composerOpen) {
			inputRef.current?.focus();
		}
	}, [composerOpen]);

	async function submit() {
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
			requestAnimationFrame(() => inputRef.current?.focus());
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
					onClick={() => setComposerOpen(true)}
				>
					<IconPlus />
					Add event
				</Button>
			</div>

			{composerOpen && (
				<div className="mt-3">
					<div className="flex items-center gap-2 rounded-xl border bg-muted/20 p-2">
						<Input
							ref={inputRef}
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
							disabled={isSubmitting}
							aria-label="Cancel"
							title="Cancel"
						>
							<IconX />
						</Button>
						<Button
							size="icon-sm"
							onClick={submit}
							disabled={isSubmitting}
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
