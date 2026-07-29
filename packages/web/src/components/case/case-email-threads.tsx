import { Link } from "@tanstack/react-router";
import { formatShortDate } from "#/components/case/format.ts";
import type { CaseDetail } from "#/components/case/types.ts";
import { UnlinkEmailThreadButton } from "#/components/case/unlink-email-thread-button.tsx";
import { parseEmailReply } from "#/components/email/parse-email-reply.ts";
import { ThreadUnreadDot } from "#/components/email/thread-unread-dot.tsx";
import { cn } from "#/lib/utils.ts";

export function CaseEmailThreads({ detail }: { detail: CaseDetail }) {
	return (
		<section className="mt-10 border-t pt-8">
			<h2 className="text-sm font-semibold">Email threads</h2>

			<div className="mt-2 space-y-0.5">
				{detail.emailThreads.map(({ relation, thread, latestMessage }) => {
					if (!thread) {
						return null;
					}
					const preview = latestMessage
						? parseEmailReply(latestMessage.textBody)
								.authoredText.replace(/\s+/g, " ")
								.trim()
						: "";
					const participant = latestMessage
						? latestMessage.from.name || latestMessage.from.address
						: "Email thread";

					return (
						<div
							key={relation._id}
							className="group flex min-w-0 items-center rounded-lg transition-colors hover:bg-muted"
						>
							<Link
								to="/email"
								search={{ thread: thread._id }}
								className={cn(
									"grid min-w-0 flex-1 items-center gap-x-2 px-3 py-2 text-xs text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring",
									thread.isUnread
										? "grid-cols-[0.5rem_max-content_minmax(0,1fr)_auto]"
										: "grid-cols-[max-content_minmax(0,1fr)_auto]",
								)}
							>
								{thread.isUnread && <ThreadUnreadDot isUnread />}
								<span
									className={cn(
										"truncate",
										thread.isUnread
											? "font-semibold text-foreground"
											: "font-medium text-muted-foreground",
									)}
								>
									{participant}
								</span>
								<span className="min-w-0 truncate">
									<span
										className={
											thread.isUnread ? "font-semibold" : "font-medium"
										}
									>
										{latestMessage?.subject || "(No subject)"}
									</span>
									{preview && (
										<span
											className={cn(
												thread.isUnread
													? "font-semibold text-foreground"
													: "text-muted-foreground",
											)}
										>
											{" "}
											{preview}
										</span>
									)}
								</span>
								<time
									className={cn(
										"shrink-0",
										thread.isUnread
											? "font-semibold text-foreground"
											: "text-muted-foreground",
									)}
								>
									{formatShortDate(thread.lastActivityAt)}
								</time>
							</Link>
							<UnlinkEmailThreadButton
								relationId={relation._id}
								label={latestMessage?.subject || "email thread"}
								className="mr-1"
							/>
						</div>
					);
				})}

				{detail.emailThreads.length === 0 && (
					<p className="text-sm text-muted-foreground">
						No email threads linked yet.
					</p>
				)}
			</div>
		</section>
	);
}
