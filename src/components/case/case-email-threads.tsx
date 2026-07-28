import { IconMail } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { formatShortDate } from "./format.ts";
import type { CaseDetail } from "./types.ts";
import { UnlinkEmailThreadButton } from "./unlink-email-thread-button.tsx";

export function CaseEmailThreads({ detail }: { detail: CaseDetail }) {
	return (
		<section className="mt-10 border-t pt-8">
			<div>
				<h2 className="text-sm font-semibold">Email threads</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					Active conversations linked to this case.
				</p>
			</div>

			<div className="mt-4 grid gap-2 sm:grid-cols-2">
				{detail.emailThreads.map(({ relation, thread, latestMessage }) =>
					thread ? (
						<div
							key={relation._id}
							className="group flex min-w-0 items-center rounded-xl border bg-background transition-[background-color,transform] hover:bg-muted active:scale-99"
						>
							<Link
								to="/email"
								search={{ thread: thread._id }}
								className="flex min-w-0 flex-1 items-center gap-3 p-3 text-foreground no-underline"
							>
								<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
									<IconMail className="size-4" />
								</span>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-sm font-medium">
										{latestMessage?.subject || "(No subject)"}
									</span>
									<span className="block truncate text-xs text-muted-foreground">
										{latestMessage
											? `${latestMessage.from.name || latestMessage.from.address} · ${formatShortDate(thread.lastActivityAt)}`
											: `Email thread · ${formatShortDate(thread.lastActivityAt)}`}
									</span>
								</span>
							</Link>
							<UnlinkEmailThreadButton
								relationId={relation._id}
								label={latestMessage?.subject || "email thread"}
								className="mr-2"
							/>
						</div>
					) : null,
				)}

				{detail.emailThreads.length === 0 && (
					<p className="text-sm text-muted-foreground">
						No email threads linked yet.
					</p>
				)}
			</div>
		</section>
	);
}
