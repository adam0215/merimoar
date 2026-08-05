import type * as React from "react";

import { fieldSurfaceClassName } from "#/components/ui/field-surface.ts";
import { cn } from "#/lib/utils.ts";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"flex field-sizing-content min-h-16 w-full resize-none rounded-xl px-3 py-3 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
				fieldSurfaceClassName,
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
