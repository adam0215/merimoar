import { MessageScroller as MessageScrollerPrimitive } from "@shadcn/react/message-scroller";
import { IconArrowDown } from "@tabler/icons-react";
import * as React from "react";
import { Button } from "#/components/ui/button.tsx";
import { cn } from "#/lib/utils.ts";

const MessageScrollerProvider = MessageScrollerPrimitive.Provider;

function MessageScroller({
	className,
	...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Root>) {
	return (
		<MessageScrollerPrimitive.Root
			data-slot="message-scroller"
			className={cn(
				"group/message-scroller relative flex size-full min-h-0 flex-col overflow-hidden",
				className,
			)}
			{...props}
		/>
	);
}

function MessageScrollerViewport({
	className,
	...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Viewport>) {
	return (
		<MessageScrollerPrimitive.Viewport
			data-slot="message-scroller-viewport"
			className={cn(
				"size-full min-h-0 min-w-0 scroll-fade-b scrollbar-thin scrollbar-gutter-stable overflow-y-auto overscroll-contain contain-content data-autoscrolling:scrollbar-thumb-transparent data-autoscrolling:scrollbar-track-transparent",
				className,
			)}
			{...props}
		/>
	);
}

function MessageScrollerContent({
	className,
	...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Content>) {
	return (
		<MessageScrollerPrimitive.Content
			data-slot="message-scroller-content"
			className={cn("flex h-max min-h-full flex-col gap-8", className)}
			{...props}
		/>
	);
}

function MessageScrollerItem({
	className,
	scrollAnchor = false,
	...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Item>) {
	return (
		<MessageScrollerPrimitive.Item
			data-slot="message-scroller-item"
			scrollAnchor={scrollAnchor}
			className={cn(
				"min-w-0 shrink-0 [contain-intrinsic-size:auto_10rem] [content-visibility:auto]",
				className,
			)}
			{...props}
		/>
	);
}

function MessageScrollerButton({
	className,
	...props
}: Omit<
	React.ComponentProps<typeof MessageScrollerPrimitive.Button>,
	"children" | "direction" | "render"
>) {
	return (
		<MessageScrollerPrimitive.Button
			data-slot="message-scroller-button"
			direction="end"
			className={cn(
				"absolute inset-s-1/2 bottom-4 -translate-x-1/2 border-border bg-background text-foreground transition duration-200 hover:bg-muted hover:text-foreground data-[active=false]:pointer-events-none data-[active=false]:translate-y-full data-[active=false]:scale-95 data-[active=false]:opacity-0 data-[active=false]:duration-400 data-[active=false]:ease-[cubic-bezier(0.7,0,0.84,0)] data-[active=true]:translate-y-0 data-[active=true]:scale-100 data-[active=true]:opacity-100 data-[active=true]:ease-[cubic-bezier(0.23,1,0.32,1)] rtl:translate-x-1/2",
				className,
			)}
			render={<Button variant="secondary" size="icon-sm" />}
			{...props}
		>
			<IconArrowDown />
			<span className="sr-only">Scroll to end</span>
		</MessageScrollerPrimitive.Button>
	);
}

export {
	MessageScrollerProvider,
	MessageScroller,
	MessageScrollerViewport,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerButton,
};
