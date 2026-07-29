"use client";

import { PreviewCard as HoverCardPrimitive } from "@base-ui/react/preview-card";
import { cn } from "#/lib/utils.ts";

function HoverCard({ ...props }: HoverCardPrimitive.Root.Props) {
	return <HoverCardPrimitive.Root data-slot="hover-card" {...props} />;
}

function HoverCardTrigger({ ...props }: HoverCardPrimitive.Trigger.Props) {
	return (
		<HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
	);
}

function HoverCardContent({
	className,
	align = "start",
	alignOffset = 0,
	side = "right",
	sideOffset = 8,
	container,
	...props
}: HoverCardPrimitive.Popup.Props &
	Pick<
		HoverCardPrimitive.Positioner.Props,
		"align" | "alignOffset" | "side" | "sideOffset"
	> & {
		container?: HoverCardPrimitive.Portal.Props["container"];
	}) {
	return (
		<HoverCardPrimitive.Portal container={container} className="contents">
			<HoverCardPrimitive.Positioner
				align={align}
				alignOffset={alignOffset}
				side={side}
				sideOffset={sideOffset}
				className="z-70"
			>
				<HoverCardPrimitive.Popup
					data-slot="hover-card-content"
					className={cn(
						"z-70 w-80 origin-(--transform-origin) rounded-2xl bg-popover p-4 text-sm text-popover-foreground shadow-2xl ring-1 ring-foreground/5 outline-hidden duration-150 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:duration-0",
						className,
					)}
					{...props}
				/>
			</HoverCardPrimitive.Positioner>
		</HoverCardPrimitive.Portal>
	);
}

export { HoverCard, HoverCardContent, HoverCardTrigger };
