"use client";

import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import {
	IconAlertOctagon,
	IconAlertTriangle,
	IconCircleCheck,
	IconInfoCircle,
	IconLoader,
	IconX,
} from "@tabler/icons-react";
import type * as React from "react";
import { Button } from "#/components/ui/button.tsx";
import { cn } from "#/lib/utils.ts";

const toastManager = ToastPrimitive.createToastManager();
const defaultToastActionRender = <Button variant="secondary" size="sm" />;
const defaultToastCloseRender = <Button variant="ghost" size="icon-sm" />;

const toastTypeStyles = {
	success: {
		icon: IconCircleCheck,
		rootClassName: "border-success/25",
		iconClassName: "bg-success/10 text-success",
	},
	info: {
		icon: IconInfoCircle,
		rootClassName: "border-system-blue/25",
		iconClassName: "bg-system-blue/10 text-system-blue",
	},
	warning: {
		icon: IconAlertTriangle,
		rootClassName: "border-alert/25",
		iconClassName: "bg-alert/10 text-alert",
	},
	error: {
		icon: IconAlertOctagon,
		rootClassName: "border-destructive/25",
		iconClassName: "bg-destructive/10 text-destructive",
	},
	loading: {
		icon: IconLoader,
		rootClassName: "border-border",
		iconClassName: "bg-muted text-muted-foreground",
	},
} as const;

const toastRootClassName = cn(
	"group/toast pointer-events-auto absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] w-full origin-bottom rounded-2xl border bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-sm will-change-transform outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
	"[--gap:0.75rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))]",
	"h-(--height) [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_240ms_cubic-bezier(0.23,1,0.32,1),opacity_160ms_ease,height_150ms_ease] motion-reduce:transition-none",
	"after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
	"data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
	"data-limited:opacity-0 data-starting-style:[transform:translateY(150%)]",
	"[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)]",
	"data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
	"data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
	"data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
	"data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
	"data-expanded:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
	"data-expanded:data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
	"data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
	"data-expanded:data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
);

export type ToastType = keyof typeof toastTypeStyles;

export type ToastOptions = {
	title: React.ReactNode;
	description?: React.ReactNode;
	type: ToastType;
	timeout?: number;
	priority?: "low" | "high";
	actionProps?: React.ComponentPropsWithoutRef<"button">;
};

export const toast = {
	add(options: ToastOptions) {
		return toastManager.add(options);
	},
	close(id?: string) {
		toastManager.close(id);
	},
};

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
	return (
		<ToastPrimitive.Viewport
			data-slot="toast-viewport"
			className={cn(
				"pointer-events-none fixed inset-x-4 bottom-4 z-50 mx-auto w-auto max-w-sm outline-none sm:right-4 sm:left-auto sm:mx-0 sm:w-full",
				className,
			)}
			{...props}
		/>
	);
}

function Toast({ className, ...props }: ToastPrimitive.Root.Props) {
	return (
		<ToastPrimitive.Root
			data-slot="toast"
			className={cn(toastRootClassName, className)}
			{...props}
		/>
	);
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
	return (
		<ToastPrimitive.Content
			data-slot="toast-content"
			className={cn(
				"flex h-full items-center gap-3 overflow-hidden p-4 transition-opacity duration-200 ease-out data-behind:opacity-0 data-expanded:opacity-100 motion-reduce:transition-none",
				className,
			)}
			{...props}
		/>
	);
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
	return (
		<ToastPrimitive.Title
			data-slot="toast-title"
			className={cn("text-sm font-medium", className)}
			{...props}
		/>
	);
}

function ToastDescription({
	className,
	...props
}: ToastPrimitive.Description.Props) {
	return (
		<ToastPrimitive.Description
			data-slot="toast-description"
			className={cn("text-sm text-muted-foreground", className)}
			{...props}
		/>
	);
}

function ToastAction({
	className,
	render = defaultToastActionRender,
	...props
}: ToastPrimitive.Action.Props) {
	return (
		<ToastPrimitive.Action
			data-slot="toast-action"
			render={render}
			className={cn("shrink-0", className)}
			{...props}
		/>
	);
}

function ToastClose({
	className,
	children,
	render = defaultToastCloseRender,
	...props
}: ToastPrimitive.Close.Props) {
	return (
		<ToastPrimitive.Close
			data-slot="toast-close"
			aria-label="Close toast"
			render={render}
			className={cn(
				"relative shrink-0 text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:text-foreground",
				className,
			)}
			{...props}
		>
			{children ?? <IconX aria-hidden="true" />}
		</ToastPrimitive.Close>
	);
}

function isToastType(type: string | undefined): type is ToastType {
	return type !== undefined && Object.hasOwn(toastTypeStyles, type);
}

function ToastIcon({ type }: { type: ToastType }) {
	const style = toastTypeStyles[type];
	const Icon = style.icon;

	return (
		<span
			data-slot="toast-icon"
			className={cn(
				"flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:pointer-events-none [&_svg]:size-4",
				style.iconClassName,
			)}
		>
			<Icon
				className={type === "loading" ? "animate-spin" : undefined}
				aria-hidden="true"
			/>
		</span>
	);
}

function ToastList() {
	const { toasts } = ToastPrimitive.useToastManager();

	return toasts.map((toastItem) => {
		const type = isToastType(toastItem.type) ? toastItem.type : "info";

		return (
			<Toast
				key={toastItem.id}
				toast={toastItem}
				className={toastTypeStyles[type].rootClassName}
			>
				<ToastContent>
					<ToastIcon type={type} />
					<div className="flex min-w-0 flex-1 flex-col gap-1">
						<ToastTitle />
						<ToastDescription />
					</div>
					<ToastAction />
					<ToastClose />
				</ToastContent>
			</Toast>
		);
	});
}

export function Toaster({
	children,
	...props
}: Omit<ToastPrimitive.Provider.Props, "toastManager">) {
	return (
		<ToastPrimitive.Provider toastManager={toastManager} {...props}>
			{children}
			<ToastPrimitive.Portal data-slot="toast-portal">
				<ToastViewport>
					<ToastList />
				</ToastViewport>
			</ToastPrimitive.Portal>
		</ToastPrimitive.Provider>
	);
}
