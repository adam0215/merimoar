import { IconCheck, IconLoader2, IconX } from "@tabler/icons-react";
import { Button } from "#/components/ui/button.tsx";
import { fieldSurfaceClassName } from "#/components/ui/field-surface.ts";
import { cn } from "#/lib/utils.ts";

export function CaseEventComposer({
	body,
	onBodyChange,
	onCancel,
	onSubmit,
	isSubmitting = false,
	disabled = false,
	error,
	autoFocus = true,
}: {
	body: string;
	onBodyChange: (body: string) => void;
	onCancel: () => void;
	onSubmit: () => void;
	isSubmitting?: boolean;
	disabled?: boolean;
	error?: string | null;
	autoFocus?: boolean;
}) {
	const controlsDisabled = disabled || isSubmitting;

	return (
		<div>
			<div
				className={cn(
					"flex min-h-12 items-center gap-2 rounded-lg p-2 transition-colors has-focus-visible:ring-1 has-focus-visible:ring-ring has-focus-visible:ring-offset-1 has-focus-visible:ring-offset-background",
					fieldSurfaceClassName,
					disabled && "cursor-not-allowed opacity-50",
				)}
			>
				<input
					value={body}
					disabled={disabled}
					autoFocus={autoFocus}
					onChange={(event) => onBodyChange(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							if (event.metaKey || event.ctrlKey) {
								onSubmit();
							}
						}
						if (event.key === "Escape") {
							event.stopPropagation();
							onCancel();
						}
					}}
					placeholder="Write an event…  ⌘ Enter to add"
					className="h-8 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
				/>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={onCancel}
					disabled={controlsDisabled}
					aria-label="Cancel"
					title="Cancel"
				>
					<IconX />
				</Button>
				<Button
					type="button"
					size="icon-sm"
					onClick={onSubmit}
					disabled={controlsDisabled}
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
	);
}
