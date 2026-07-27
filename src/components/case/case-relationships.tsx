import {
	IconAlertCircle,
	IconCircleCheckFilled,
	IconCornerDownLeft,
	IconFolder,
	IconLoader2,
	IconPlus,
	IconSearch,
	IconX,
} from "@tabler/icons-react";
import { useHotkeys, useKeyHold } from "@tanstack/react-hotkeys";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";
import { EntityIcon } from "#/lib/entity-icons.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { initials } from "./format.ts";
import type { CaseDetail } from "./types.ts";

export function CaseRelationships({ detail }: { detail: CaseDetail }) {
	const currentContactIds = new Set(
		detail.contacts.flatMap((item) => (item.contact ? [item.contact._id] : [])),
	);
	const currentEntityIds = new Set(
		detail.entities.flatMap((item) => (item.entity ? [item.entity._id] : [])),
	);
	const currentRelatedCaseIds = new Set(
		detail.relatedCases.flatMap((item) =>
			item.relatedCase ? [item.relatedCase._id] : [],
		),
	);

	return (
		<section className="mt-10 border-t pt-8">
			<div>
				<h2 className="text-sm font-semibold">Relationships</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					People and records connected to this case.
				</p>
			</div>

			<div className="mt-4 grid gap-2 sm:grid-cols-2">
				{detail.contacts.map(({ relation, contact }) =>
					contact ? (
						<div
							key={relation._id}
							className="flex min-w-0 items-center gap-2 rounded-xl border bg-background p-2"
						>
							<Link
								to="/contacts"
								search={{ contact: contact._id }}
								className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-foreground no-underline transition-colors hover:bg-muted"
							>
								<Avatar className="size-9">
									<AvatarFallback>
										{initials(contact.name || contact.address)}
									</AvatarFallback>
								</Avatar>
								<span className="min-w-0">
									<span className="block truncate text-sm font-medium">
										{contact.name || contact.address}
									</span>
									<span className="block truncate text-xs text-muted-foreground">
										{contact.name ? contact.address : "Contact"}
									</span>
								</span>
							</Link>
							<RemoveRelationshipButton
								label={contact.name || contact.address}
								relation={{
									kind: "contact",
									relationId: relation._id,
								}}
							/>
						</div>
					) : null,
				)}
				{detail.entities.map(({ relation, entity, entityType }) =>
					entity && entityType ? (
						<div
							key={relation._id}
							className="flex min-w-0 items-center gap-3 rounded-xl border bg-background p-3"
						>
							<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
								<EntityIcon icon={entityType.icon} className="size-4" />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm font-medium">
									{entity.displayName}
								</span>
								<span className="block truncate text-xs text-muted-foreground">
									{entityType.name} · {entity.identifier}
								</span>
							</span>
							<RemoveRelationshipButton
								label={entity.displayName}
								relation={{
									kind: "entity",
									relationId: relation._id,
								}}
							/>
						</div>
					) : null,
				)}
				{detail.relatedCases.map(({ relation, relatedCase }) =>
					relatedCase ? (
						<div
							key={relation._id}
							className="flex min-w-0 items-center gap-2 rounded-xl border bg-background p-2"
						>
							<Link
								to="/cases"
								search={{ case: relatedCase._id }}
								className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-foreground no-underline transition-colors hover:bg-muted"
							>
								<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
									<IconFolder className="size-4" />
								</span>
								<span className="min-w-0">
									<span className="block truncate text-sm font-medium">
										{relatedCase.title}
									</span>
									<span className="block truncate text-xs text-muted-foreground">
										{relatedCase.reference} · Case
									</span>
								</span>
							</Link>
							<RemoveRelationshipButton
								label={`${relatedCase.reference}: ${relatedCase.title}`}
								relation={{
									kind: "case",
									relationId: relation._id,
								}}
							/>
						</div>
					) : null,
				)}
				<AddRelationshipDialog
					caseId={detail.case._id}
					currentContactIds={currentContactIds}
					currentEntityIds={currentEntityIds}
					currentRelatedCaseIds={currentRelatedCaseIds}
					trigger={
						<button
							type="button"
							className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-dashed p-3 text-left text-muted-foreground transition-[color,background-color,transform] hover:bg-muted/50 hover:text-foreground active:scale-99"
						>
							<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
								<IconPlus className="size-4" />
							</span>
							<span className="text-sm font-medium">Add relationship</span>
						</button>
					}
				/>
			</div>
		</section>
	);
}

function RemoveRelationshipButton({
	label,
	relation,
}: {
	label: string;
	relation:
		| { kind: "contact"; relationId: Id<"caseContactRelations"> }
		| { kind: "entity"; relationId: Id<"caseEntityRelations"> }
		| { kind: "case"; relationId: Id<"caseCaseRelations"> };
}) {
	const removeContact = useMutation(api.case.mutations.removeContactRelation);
	const removeEntity = useMutation(api.case.mutations.removeEntityRelation);
	const removeCase = useMutation(api.case.mutations.removeCaseRelation);
	const [isRemoving, setIsRemoving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function remove() {
		setIsRemoving(true);
		setError(null);

		try {
			if (relation.kind === "contact") {
				await removeContact({ relationId: relation.relationId });
			} else if (relation.kind === "entity") {
				await removeEntity({ relationId: relation.relationId });
			} else {
				await removeCase({ relationId: relation.relationId });
			}
		} catch (caughtError) {
			setError(
				getConvexErrorMessage(
					caughtError,
					"Relationship could not be removed.",
				),
			);
		} finally {
			setIsRemoving(false);
		}
	}

	return (
		<button
			type="button"
			onClick={remove}
			disabled={isRemoving}
			className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,transform] hover:bg-muted hover:text-foreground active:scale-97 disabled:opacity-50"
			aria-label={`${error ? "Retry removing" : "Remove"} ${label}`}
			title={error ?? `Remove ${label}`}
		>
			{isRemoving ? (
				<IconLoader2 className="size-3.5 animate-spin" />
			) : error ? (
				<IconAlertCircle className="size-4 text-destructive" />
			) : (
				<IconX className="size-4" />
			)}
		</button>
	);
}

function AddRelationshipDialog({
	caseId,
	currentContactIds,
	currentEntityIds,
	currentRelatedCaseIds,
	trigger,
}: {
	caseId: Id<"cases">;
	currentContactIds: Set<Id<"contacts">>;
	currentEntityIds: Set<Id<"entities">>;
	currentRelatedCaseIds: Set<Id<"cases">>;
	trigger: React.ReactElement;
}) {
	const addContact = useMutation(api.case.mutations.addContactRelation);
	const addEntity = useMutation(api.case.mutations.addEntityRelation);
	const addCase = useMutation(api.case.mutations.addCaseRelation);
	const dialogRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [selectedResult, setSelectedResult] =
		useState<RelationshipSearchResult | null>(null);
	const [resultsOpen, setResultsOpen] = useState(false);
	const [highlightedIndex, setHighlightedIndex] = useState(-1);
	const [isAdding, setIsAdding] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const isMetaHeld = useKeyHold("Meta");
	const normalizedQuery = query.trim();
	const searchResults = useQuery(
		api.globalSearch.reader.search,
		debouncedQuery ? { query: debouncedQuery } : "skip",
	);
	const results = useMemo(
		() =>
			searchResults?.map((result) => ({
				...result,
				unavailableReason: getUnavailableReason(result, {
					caseId,
					currentContactIds,
					currentEntityIds,
					currentRelatedCaseIds,
				}),
			})) ?? [],
		[
			caseId,
			currentContactIds,
			currentEntityIds,
			currentRelatedCaseIds,
			searchResults,
		],
	);
	const isWaitingForResults =
		normalizedQuery !== debouncedQuery || searchResults === undefined;
	const highlightedResult =
		highlightedIndex >= 0 ? results[highlightedIndex] : undefined;

	useEffect(() => {
		const timeoutId = window.setTimeout(() => {
			setDebouncedQuery(normalizedQuery);
		}, 250);

		return () => window.clearTimeout(timeoutId);
	}, [normalizedQuery]);

	useEffect(() => {
		if (!resultsOpen || isWaitingForResults) {
			setHighlightedIndex(-1);
			return;
		}

		setHighlightedIndex((currentIndex) => {
			if (
				currentIndex >= 0 &&
				currentIndex < results.length &&
				!results[currentIndex]?.unavailableReason
			) {
				return currentIndex;
			}
			return results.findIndex((result) => !result.unavailableReason);
		});
	}, [isWaitingForResults, results, resultsOpen]);

	function resetDialog() {
		setQuery("");
		setDebouncedQuery("");
		setSelectedResult(null);
		setResultsOpen(false);
		setHighlightedIndex(-1);
		setIsAdding(false);
		setError(null);
	}

	function closeDialog() {
		setOpen(false);
		resetDialog();
	}

	function selectResult(result: RelationshipSearchResult) {
		setSelectedResult(result);
		setResultsOpen(false);
		setError(null);
		requestAnimationFrame(() => inputRef.current?.focus());
	}

	function clearSelection() {
		setSelectedResult(null);
		setResultsOpen(Boolean(normalizedQuery));
		requestAnimationFrame(() => inputRef.current?.focus());
	}

	function moveHighlight(direction: 1 | -1) {
		if (results.length === 0) {
			return;
		}

		let nextIndex = highlightedIndex;
		for (let offset = 0; offset < results.length; offset += 1) {
			nextIndex = (nextIndex + direction + results.length) % results.length;
			const nextResult = results[nextIndex];
			if (nextResult && !nextResult.unavailableReason) {
				setHighlightedIndex(nextIndex);
				document
					.getElementById(getResultOptionId(nextResult))
					?.scrollIntoView({ block: "nearest" });
				return;
			}
		}
	}

	async function addSelectedRelationship() {
		if (!selectedResult || isAdding) {
			return;
		}

		setIsAdding(true);
		setError(null);

		try {
			if (selectedResult.target.kind === "contact") {
				await addContact({
					caseId,
					contactId: selectedResult.target.contactId,
				});
			} else if (selectedResult.target.kind === "entity") {
				await addEntity({
					caseId,
					entityId: selectedResult.target.entityId,
				});
			} else {
				await addCase({
					caseId,
					relatedCaseId: selectedResult.target.caseId,
				});
			}
			closeDialog();
		} catch (caughtError) {
			setError(
				getConvexErrorMessage(caughtError, "Relationship could not be added."),
			);
		} finally {
			setIsAdding(false);
		}
	}

	useHotkeys(
		[
			{
				hotkey: "ArrowDown",
				callback: () => moveHighlight(1),
				options: {
					enabled: open && resultsOpen && !isWaitingForResults,
					meta: {
						name: "Next relationship",
						description: "Highlight the next search result",
					},
				},
			},
			{
				hotkey: "ArrowUp",
				callback: () => moveHighlight(-1),
				options: {
					enabled: open && resultsOpen && !isWaitingForResults,
					meta: {
						name: "Previous relationship",
						description: "Highlight the previous search result",
					},
				},
			},
			{
				hotkey: "Enter",
				callback: () => {
					const result = results[highlightedIndex];
					if (result && !result.unavailableReason) {
						selectResult(result);
					}
				},
				options: {
					enabled:
						open &&
						resultsOpen &&
						highlightedIndex >= 0 &&
						!isWaitingForResults,
					meta: {
						name: "Select relationship",
						description: "Select the highlighted search result",
					},
				},
			},
			{
				hotkey: "Escape",
				callback: () => {
					if (resultsOpen) {
						setResultsOpen(false);
					} else {
						closeDialog();
					}
				},
				options: {
					enabled: open,
					requireReset: true,
					meta: {
						name: "Close relationship search",
						description: "Close results first, then the dialog",
					},
				},
			},
			{
				hotkey: "Mod+Enter",
				callback: () => void addSelectedRelationship(),
				options: {
					enabled: open && selectedResult !== null && !isAdding,
					meta: {
						name: "Add relationship",
						description: "Add the selected relationship",
					},
				},
			},
		],
		{
			target: dialogRef,
			ignoreInputs: false,
			preventDefault: true,
			stopPropagation: true,
		},
	);

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
				resetDialog();
			}}
		>
			<DialogTrigger render={trigger} />
			<DialogContent ref={dialogRef} className="overflow-visible sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Add relationship</DialogTitle>
					<DialogDescription>
						Search for a contact, case, or entity.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3">
					<div className="relative">
						<div className="relative flex min-h-12 w-full items-center rounded-xl border border-input bg-input/30 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
							<input
								ref={inputRef}
								value={query}
								readOnly={selectedResult !== null}
								onChange={(event) => {
									const nextQuery = event.target.value;
									setQuery(nextQuery);
									setResultsOpen(Boolean(nextQuery.trim()));
									setError(null);
								}}
								onFocus={() => {
									if (!selectedResult && normalizedQuery) {
										setResultsOpen(true);
									}
								}}
								placeholder="Search relationships…"
								autoComplete="off"
								autoFocus
								role="combobox"
								aria-label={
									selectedResult
										? `Selected relationship: ${selectedResult.label}`
										: undefined
								}
								aria-autocomplete="list"
								aria-expanded={!selectedResult && resultsOpen}
								aria-controls="relationship-search-results"
								aria-activedescendant={
									!selectedResult && highlightedResult
										? getResultOptionId(highlightedResult)
										: undefined
								}
								className={
									selectedResult
										? "absolute size-px opacity-0"
										: "h-11 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
								}
							/>
							{selectedResult ? (
								<>
									<div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2">
										<RelationshipResultContent result={selectedResult} />
									</div>
									<button
										type="button"
										onClick={clearSelection}
										className="mr-2 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,transform] hover:bg-muted hover:text-foreground active:scale-97"
										aria-label="Clear selected relationship"
									>
										<IconX className="size-4" />
									</button>
								</>
							) : (
								<>
									<IconSearch className="order-first ml-3 size-4 shrink-0 text-muted-foreground" />
								</>
							)}
						</div>

						{resultsOpen && (
							<div
								id="relationship-search-results"
								role="listbox"
								className="absolute top-full right-0 left-0 z-60 mt-2 max-h-72 overflow-y-auto rounded-2xl bg-popover p-1.5 text-popover-foreground shadow-2xl ring-1 ring-foreground/5"
							>
								{isWaitingForResults ? (
									<div className="flex h-16 items-center justify-center text-muted-foreground">
										<IconLoader2
											className="size-4 animate-spin"
											aria-label="Searching"
										/>
									</div>
								) : results.length === 0 ? (
									<p className="px-3 py-5 text-center text-sm text-muted-foreground">
										No results
									</p>
								) : (
									results.map((result, index) => (
										<button
											key={getResultKey(result)}
											id={getResultOptionId(result)}
											type="button"
											role="option"
											aria-selected={index === highlightedIndex}
											disabled={Boolean(result.unavailableReason)}
											onMouseMove={() => {
												if (!result.unavailableReason) {
													setHighlightedIndex(index);
												}
											}}
											onClick={() => selectResult(result)}
											className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted aria-selected:bg-muted disabled:cursor-default disabled:opacity-50"
										>
											<RelationshipResultContent result={result} />
											{result.unavailableReason && (
												<span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
													<IconCircleCheckFilled className="size-4 text-accent" />
													{result.unavailableReason}
												</span>
											)}
										</button>
									))
								)}
							</div>
						)}
					</div>

					{error && (
						<p
							className="flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
							role="alert"
						>
							<IconAlertCircle className="size-4 shrink-0" />
							{error}
						</p>
					)}
				</div>

				<DialogFooter>
					<Button type="button" variant="outline" onClick={closeDialog}>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={() => void addSelectedRelationship()}
						disabled={!selectedResult || isAdding}
						aria-keyshortcuts="Meta+Enter Control+Enter"
					>
						{isAdding && <IconLoader2 className="animate-spin" />}
						{isMetaHeld ? (
							<>
								<IconCornerDownLeft />
								Enter
							</>
						) : (
							"Add"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

type RelationshipSearchResult = FunctionReturnType<
	typeof api.globalSearch.reader.search
>[number];

function getResultKey(result: RelationshipSearchResult) {
	switch (result.target.kind) {
		case "contact":
			return `contact-${result.target.contactId}`;
		case "case":
			return `case-${result.target.caseId}`;
		case "entity":
			return `entity-${result.target.entityId}`;
	}
}

function getResultOptionId(result: RelationshipSearchResult) {
	return `relationship-result-${getResultKey(result)}`;
}

function getUnavailableReason(
	result: RelationshipSearchResult,
	context: {
		caseId: Id<"cases">;
		currentContactIds: Set<Id<"contacts">>;
		currentEntityIds: Set<Id<"entities">>;
		currentRelatedCaseIds: Set<Id<"cases">>;
	},
) {
	switch (result.target.kind) {
		case "contact":
			return context.currentContactIds.has(result.target.contactId)
				? "Added"
				: null;
		case "entity":
			return context.currentEntityIds.has(result.target.entityId)
				? "Added"
				: null;
		case "case":
			if (result.target.caseId === context.caseId) {
				return "Current case";
			}
			return context.currentRelatedCaseIds.has(result.target.caseId)
				? "Added"
				: null;
	}
}

function RelationshipResultContent({
	result,
}: {
	result: RelationshipSearchResult;
}) {
	return (
		<>
			{result.target.kind === "contact" ? (
				<Avatar className="size-8 shrink-0">
					<AvatarFallback className="text-xs">
						{initials(result.label || result.identifier)}
					</AvatarFallback>
				</Avatar>
			) : (
				<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
					{result.target.kind === "entity" && result.icon ? (
						<EntityIcon icon={result.icon} className="size-4" />
					) : (
						<IconFolder className="size-4" />
					)}
				</span>
			)}
			<span className="min-w-0 flex-1">
				<span className="block truncate text-sm font-medium">
					{result.label}
				</span>
				<span className="block truncate text-xs text-muted-foreground">
					{getResultDescription(result)}
				</span>
			</span>
		</>
	);
}

function getResultDescription(result: RelationshipSearchResult) {
	if (result.target.kind === "contact") {
		return result.label === result.identifier
			? result.descriptor
			: result.identifier;
	}

	return result.target.kind === "entity"
		? `${result.descriptor} · ${result.identifier}`
		: `${result.identifier} · ${result.descriptor}`;
}
