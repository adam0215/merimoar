import { IconArrowRight, IconMailShare } from "@tabler/icons-react";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import { cn } from "#/lib/utils.ts";

export function EmailComposer({
	value,
	onValueChange,
	onSend,
	placeholder = "Write a reply…",
	senderAddress,
	disabled = false,
	isSending = false,
	className,
}: {
	value: string;
	onValueChange: (value: string) => void;
	onSend: () => void;
	placeholder?: string;
	senderAddress?: string;
	disabled?: boolean;
	isSending?: boolean;
	className?: string;
}) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [isScrollable, setIsScrollable] = useState(false);

	useLayoutEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea) {
			return;
		}

		const updateScrollableState = () => {
			setIsScrollable(textarea.scrollHeight > textarea.clientHeight + 1);
		};
		updateScrollableState();

		const resizeObserver = new ResizeObserver(updateScrollableState);
		resizeObserver.observe(textarea);
		return () => resizeObserver.disconnect();
	}, [value]);

	const cannotSend = disabled || isSending || !value.trim();

	return (
		<form
			className={cn(
				"relative flex flex-col overflow-hidden rounded-2xl bg-popover/60 text-popover-foreground shadow-2xl ring-1 ring-foreground/5 backdrop-blur-sm backdrop-saturate-150 focus-within:ring-foreground/10 dark:ring-foreground/10",
				className,
			)}
			onSubmit={(event) => {
				event.preventDefault();
				if (!cannotSend) {
					onSend();
				}
			}}
		>
			<div className="px-4 pt-4 pb-2">
				<textarea
					ref={textareaRef}
					rows={1}
					value={value}
					disabled={disabled}
					placeholder={placeholder}
					aria-label={placeholder}
					className="field-sizing-content block min-h-6 max-h-120 w-full resize-none overflow-y-auto bg-transparent text-sm leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
					onChange={(event) => onValueChange(event.currentTarget.value)}
				/>
			</div>

			<div className="relative flex min-h-12 items-center justify-between bg-transparent px-3 py-2">
				{isScrollable && (
					<div
						aria-hidden="true"
						className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-linear-to-b from-transparent to-popover/60"
					/>
				)}
				{senderAddress && (
					<span
						className="flex min-w-0 items-center gap-1.5 self-center pr-3 text-xs leading-4 text-muted-foreground"
						aria-label={`Sent from ${senderAddress}`}
					>
						<IconMailShare className="size-3.5 shrink-0" aria-hidden="true" />
						<span className="truncate">{senderAddress}</span>
					</span>
				)}
				<Button
					type="submit"
					size="icon-sm"
					disabled={cannotSend}
					aria-label="Send reply"
					aria-busy={isSending}
					className="ml-auto bg-accent text-accent-foreground hover:bg-accent/80"
				>
					<IconArrowRight className="text-accent-foreground" />
				</Button>
			</div>
		</form>
	);
}
