"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "#/lib/utils.ts";

export function BrowserListItem({
	render,
	active = false,
	visual,
	title,
	subtitle,
	trailing,
	className,
	...props
}: useRender.ComponentProps<"a"> & {
	active?: boolean;
	visual: React.ReactNode;
	title: React.ReactNode;
	subtitle?: React.ReactNode;
	trailing?: React.ReactNode;
}) {
	return useRender({
		defaultTagName: "a",
		props: mergeProps<"a">(
			{
				className: cn(
					"mb-1 flex gap-3 rounded-xl px-3 py-3.5 text-foreground no-underline outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
					active && "bg-muted",
					className,
				),
				children: (
					<>
						{visual}
						<span className="min-w-0 flex-1">
							<span className="flex items-baseline gap-2">
								<span className="min-w-0 flex-1 truncate text-sm font-medium">
									{title}
								</span>
								{trailing}
							</span>
							{subtitle !== undefined && (
								<span className="mt-0.5 block truncate text-xs text-muted-foreground">
									{subtitle}
								</span>
							)}
						</span>
					</>
				),
			},
			props,
		),
		render,
		state: { slot: "browser-list-item", active },
	});
}
