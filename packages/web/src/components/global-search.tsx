import { api } from "@merimoar/convex/api";
import {
	IconCommand,
	IconFolder,
	IconLoader2,
	IconSearch,
} from "@tabler/icons-react";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useNavigate } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex-helpers/react/cache";
import { useEffect, useState } from "react";
import { initials } from "#/components/case/format.ts";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "#/components/ui/command.tsx";
import { EntityIcon } from "#/lib/entity-icons.tsx";

type GlobalSearchResult = FunctionReturnType<
	typeof api.globalSearch.reader.search
>[number];

export function GlobalSearch() {
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const normalizedQuery = query.trim();
	const results = useQuery(
		api.globalSearch.reader.search,
		open && debouncedQuery ? { query: debouncedQuery } : "skip",
	);
	const isWaitingForResults = Boolean(
		normalizedQuery &&
			(normalizedQuery !== debouncedQuery || results === undefined),
	);

	useEffect(() => {
		const timeoutId = window.setTimeout(() => {
			setDebouncedQuery(normalizedQuery);
		}, 200);

		return () => window.clearTimeout(timeoutId);
	}, [normalizedQuery]);

	useHotkeys(
		[
			{
				hotkey: "Mod+K",
				callback: () => handleOpenChange(!open),
				options: {
					requireReset: true,
					meta: {
						name: "Global search",
						description: "Open or close global search",
					},
				},
			},
		],
		{
			preventDefault: true,
			stopPropagation: true,
		},
	);

	function handleOpenChange(nextOpen: boolean) {
		setOpen(nextOpen);
		if (!nextOpen) {
			setQuery("");
			setDebouncedQuery("");
		}
	}

	function openResult(result: GlobalSearchResult) {
		handleOpenChange(false);

		switch (result.target.kind) {
			case "contact":
				void navigate({
					to: "/contacts",
					search: { contact: result.target.contactId },
				});
				return;
			case "case":
				void navigate({
					to: "/cases",
					search: { case: result.target.caseId },
				});
				return;
			case "entity":
				void navigate({
					to: "/settings/organization/entities",
					search: { type: result.target.entityTypeId },
				});
				return;
		}
	}

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="hidden h-8 w-full max-w-64 items-center gap-2 justify-self-center rounded-lg border border-input bg-input/30 px-3 text-sm text-muted-foreground outline-none transition-[background-color,border-color,transform] hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px md:flex"
				aria-label="Open global search"
				aria-haspopup="dialog"
				aria-keyshortcuts="Meta+K Control+K"
			>
				<IconSearch className="size-4 shrink-0" />
				<span>Search</span>
				<kbd className="ml-auto inline-flex h-5 items-center gap-0.5 rounded-md border border-border bg-background px-1.5 text-[11px] font-medium text-muted-foreground shadow-[0_2px_0_var(--border)]">
					<IconCommand
						className="mb-[1.5px] size-3"
						stroke={1.75}
						aria-hidden="true"
					/>
					K
				</kbd>
			</button>

			<CommandDialog
				open={open}
				onOpenChange={handleOpenChange}
				title="Global search"
				description="Search cases, contacts, and records."
				className="sm:max-w-xl"
			>
				<Command shouldFilter={false} loop>
					<CommandInput
						value={query}
						onValueChange={setQuery}
						placeholder="Search cases, contacts, and records..."
						autoFocus
					/>
					<CommandList>
						{!normalizedQuery ? (
							<CommandEmpty className="text-muted-foreground">
								Type to start searching.
							</CommandEmpty>
						) : isWaitingForResults ? (
							<div className="flex h-16 items-center justify-center text-muted-foreground">
								<IconLoader2
									className="size-4 animate-spin"
									aria-label="Searching"
								/>
							</div>
						) : results?.length ? (
							<CommandGroup heading="Results">
								{results.map((result) => (
									<CommandItem
										key={result.entryId}
										value={result.entryId}
										onSelect={() => openResult(result)}
									>
										<SearchResultVisual result={result} />
										<span className="min-w-0 flex-1">
											<span className="block truncate font-medium">
												{result.label}
											</span>
											<span className="block truncate text-xs text-muted-foreground">
												{getResultDescription(result)}
											</span>
										</span>
									</CommandItem>
								))}
							</CommandGroup>
						) : (
							<CommandEmpty className="text-muted-foreground">
								No results found.
							</CommandEmpty>
						)}
					</CommandList>
				</Command>
			</CommandDialog>
		</>
	);
}

function SearchResultVisual({ result }: { result: GlobalSearchResult }) {
	if (result.target.kind === "contact") {
		return (
			<Avatar className="size-8">
				<AvatarFallback className="text-xs">
					{initials(result.label || result.identifier)}
				</AvatarFallback>
			</Avatar>
		);
	}

	return (
		<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
			{result.target.kind === "entity" && result.icon ? (
				<EntityIcon icon={result.icon} className="size-4" />
			) : (
				<IconFolder className="size-4" />
			)}
		</span>
	);
}

function getResultDescription(result: GlobalSearchResult) {
	if (result.target.kind === "contact") {
		return result.label === result.identifier
			? result.descriptor
			: result.identifier;
	}

	return result.target.kind === "entity"
		? `${result.descriptor} · ${result.identifier}`
		: `${result.identifier} · ${result.descriptor}`;
}
