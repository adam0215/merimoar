"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { Input } from "#/components/ui/input.tsx";
import { cn } from "#/lib/utils.ts";

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="input-group"
			role="group"
			className={cn(
				"group/input-group relative flex h-9 w-full min-w-0 items-center rounded-lg border border-input bg-input/30 transition-colors outline-none",
				"has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-3 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50",
				"has-[[data-slot][aria-invalid=true]]:border-destructive has-[[data-slot][aria-invalid=true]]:ring-3 has-[[data-slot][aria-invalid=true]]:ring-destructive/20 dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40",
				className,
			)}
			{...props}
		/>
	);
}

const inputGroupAddonVariants = cva(
	"flex h-full cursor-text items-center justify-center gap-2 text-sm font-medium text-muted-foreground select-none group-data-[disabled=true]/input-group:opacity-50",
	{
		variants: {
			align: {
				"inline-start": "order-first pl-3",
				"inline-end": "order-last",
			},
		},
		defaultVariants: {
			align: "inline-start",
		},
	},
);

function InputGroupAddon({
	className,
	align = "inline-start",
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
	return (
		<div
			role="group"
			data-slot="input-group-addon"
			data-align={align}
			className={cn(inputGroupAddonVariants({ align }), className)}
			{...props}
		/>
	);
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span
			className={cn(
				"flex items-center text-sm text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}

function InputGroupInput({
	className,
	...props
}: React.ComponentProps<"input">) {
	return (
		<Input
			data-slot="input-group-control"
			className={cn(
				"flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 aria-invalid:border-0 aria-invalid:ring-0 dark:bg-transparent",
				className,
			)}
			{...props}
		/>
	);
}

export { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText };
