import { cn } from "#/lib/utils.ts";

export function ThreadUnreadDot({
	isUnread,
	className,
}: {
	isUnread: boolean | undefined;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"size-2 shrink-0 rounded-full",
				isUnread ? "bg-accent" : "bg-transparent",
				className,
			)}
		>
			{isUnread && <span className="sr-only">Unread</span>}
		</span>
	);
}
