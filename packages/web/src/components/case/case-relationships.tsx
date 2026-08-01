import { api } from "@merimoar/convex/api";
import type { Id } from "@merimoar/convex/data-model";
import {
	IconAlertCircle,
	IconCircleCheckFilled,
	IconCornerDownLeft,
	IconFolder,
	IconLoader2,
	IconPlus,
	IconX,
} from "@tabler/icons-react";
import { useKeyHold } from "@tanstack/react-hotkeys";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "react";
import { useCurrentCaseInteractionPolicy } from "#/components/case/case-interaction-policy.tsx";
import { initials } from "#/components/case/format.ts";
import type { CaseDetail } from "#/components/case/types.ts";
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
import { SearchCombobox } from "#/components/ui/search-combobox.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";
import { EntityIcon, type EntityIconKey } from "#/lib/entity-icons.tsx";

type RelationshipRemoval =
	| { kind: "contact"; relationId: Id<"caseContactRelations"> }
	| { kind: "entity"; relationId: Id<"caseEntityRelations"> }
	| { kind: "case"; relationId: Id<"caseCaseRelations"> };

type CaseRelationship = {
	id: string;
	title: string;
	detail: string;
	visual:
		| { kind: "avatar"; fallback: string }
		| { kind: "entity"; icon: EntityIconKey }
		| { kind: "folder" };
	target?: { kind: "contact"; id: string } | { kind: "case"; id: string };
	roomy?: boolean;
	removeLabel: string;
	removal: RelationshipRemoval;
};

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

	const items: CaseRelationship[] = [
		...detail.contacts.flatMap(({ relation, contact }): CaseRelationship[] =>
			contact
				? [
						{
							id: relation._id,
							title: contact.name || contact.address,
							detail: contact.name ? contact.address : "Contact",
							visual: {
								kind: "avatar",
								fallback: initials(contact.name || contact.address),
							},
							target: { kind: "contact", id: contact._id },
							removeLabel: contact.name || contact.address,
							removal: { kind: "contact", relationId: relation._id },
						},
					]
				: [],
		),
		...detail.entities.flatMap(
			({ relation, entity, entityType }): CaseRelationship[] =>
				entity && entityType
					? [
							{
								id: relation._id,
								title: entity.displayName,
								detail: `${entityType.name} · ${entity.identifier}`,
								visual: { kind: "entity", icon: entityType.icon },
								roomy: true,
								removeLabel: entity.displayName,
								removal: { kind: "entity", relationId: relation._id },
							},
						]
					: [],
		),
		...detail.relatedCases.flatMap(
			({ relation, relatedCase }): CaseRelationship[] =>
				relatedCase
					? [
							{
								id: relation._id,
								title: relatedCase.title,
								detail: `${relatedCase.reference} · Case`,
								visual: { kind: "folder" },
								target: { kind: "case", id: relatedCase._id },
								removeLabel: `${relatedCase.reference}: ${relatedCase.title}`,
								removal: { kind: "case", relationId: relation._id },
							},
						]
					: [],
		),
	];

	return (
		<section className="mt-10 border-t pt-8">
			<h2 className="text-sm font-semibold">Relationships</h2>
			<div className="mt-4 grid gap-2 sm:grid-cols-2">
				{items.map((item) => (
					<RelationshipRow key={item.id} item={item} />
				))}
				<AddRelationshipDialog
					caseId={detail.case._id}
					currentContactIds={currentContactIds}
					currentEntityIds={currentEntityIds}
					currentRelatedCaseIds={currentRelatedCaseIds}
				/>
			</div>
		</section>
	);
}

function RelationshipRow({ item }: { item: CaseRelationship }) {
	const content = (
		<>
			<RelationshipVisual visual={item.visual} />
			<span className="min-w-0 flex-1">
				<span className="block truncate text-sm font-medium">{item.title}</span>
				<span className="block truncate text-xs text-muted-foreground">
					{item.detail}
				</span>
			</span>
		</>
	);

	return (
		<div
			className={
				item.roomy
					? "flex min-w-0 items-center gap-3 rounded-xl border bg-background p-3"
					: "flex min-w-0 items-center gap-2 rounded-xl border bg-background p-2"
			}
		>
			{item.target?.kind === "contact" ? (
				<Link
					to="/contacts"
					search={{ contact: item.target.id }}
					className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-foreground no-underline transition-colors hover:bg-muted"
				>
					{content}
				</Link>
			) : item.target?.kind === "case" ? (
				<Link
					to="/cases"
					search={{ case: item.target.id }}
					className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-foreground no-underline transition-colors hover:bg-muted"
				>
					{content}
				</Link>
			) : (
				content
			)}
			<RemoveRelationshipButton
				label={item.removeLabel}
				relation={item.removal}
			/>
		</div>
	);
}

function RelationshipVisual({
	visual,
}: {
	visual: CaseRelationship["visual"];
}) {
	if (visual.kind === "avatar") {
		return (
			<Avatar className="size-9 shrink-0">
				<AvatarFallback>{visual.fallback}</AvatarFallback>
			</Avatar>
		);
	}

	return (
		<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
			{visual.kind === "entity" ? (
				<EntityIcon icon={visual.icon} className="size-4" />
			) : (
				<IconFolder className="size-4" />
			)}
		</span>
	);
}

function RemoveRelationshipButton({
	label,
	relation,
}: {
	label: string;
	relation: RelationshipRemoval;
}) {
	const { readOnly, readOnlyReason } = useCurrentCaseInteractionPolicy();
	const removeContact = useMutation(api.case.mutations.removeContactRelation);
	const removeEntity = useMutation(api.case.mutations.removeEntityRelation);
	const removeCase = useMutation(api.case.mutations.removeCaseRelation);
	const [isRemoving, setIsRemoving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function remove() {
		if (readOnly) {
			return;
		}

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
			disabled={readOnly || isRemoving}
			className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-97 disabled:opacity-50"
			aria-label={`${error ? "Retry removing" : "Remove"} ${label}`}
			title={readOnly ? readOnlyReason : (error ?? `Remove ${label}`)}
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
}: {
	caseId: Id<"cases">;
	currentContactIds: Set<Id<"contacts">>;
	currentEntityIds: Set<Id<"entities">>;
	currentRelatedCaseIds: Set<Id<"cases">>;
}) {
	const { readOnly, readOnlyReason } = useCurrentCaseInteractionPolicy();
	const addContact = useMutation(api.case.mutations.addContactRelation);
	const addEntity = useMutation(api.case.mutations.addEntityRelation);
	const addCase = useMutation(api.case.mutations.addCaseRelation);
	const dialogRef = useRef<HTMLDivElement>(null);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [selectedResult, setSelectedResult] =
		useState<RelationshipSearchResult | null>(null);
	const [recentRelationshipsRequested, setRecentRelationshipsRequested] =
		useState(false);
	const [isAdding, setIsAdding] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const isMetaHeld = useKeyHold("Meta");
	const normalizedQuery = query.trim();
	const searchResults = useQuery(
		api.globalSearch.reader.search,
		debouncedQuery ? { query: debouncedQuery } : "skip",
	);
	const recentRelationships = useQuery(
		api.globalSearch.reader.listRecentRelationshipCandidates,
		recentRelationshipsRequested && !normalizedQuery ? {} : "skip",
	);
	const candidates: RelationshipSearchCandidate[] = debouncedQuery
		? (searchResults ?? [])
		: (recentRelationships ?? []);
	const results = candidates.map((result) => ({
		...result,
		unavailableReason: getUnavailableReason(result, {
			caseId,
			currentContactIds,
			currentEntityIds,
			currentRelatedCaseIds,
		}),
	}));
	const isWaitingForResults = normalizedQuery
		? normalizedQuery !== debouncedQuery || searchResults === undefined
		: recentRelationshipsRequested && recentRelationships === undefined;

	useEffect(() => {
		const timeoutId = window.setTimeout(() => {
			setDebouncedQuery(normalizedQuery);
		}, 250);

		return () => window.clearTimeout(timeoutId);
	}, [normalizedQuery]);

	function resetDialog() {
		setQuery("");
		setDebouncedQuery("");
		setSelectedResult(null);
		setRecentRelationshipsRequested(false);
		setIsAdding(false);
		setError(null);
	}

	function closeDialog() {
		setOpen(false);
		resetDialog();
	}

	async function addSelectedRelationship() {
		if (readOnly || !selectedResult || isAdding) {
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

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (nextOpen && readOnly) {
					return;
				}
				setOpen(nextOpen);
				resetDialog();
			}}
		>
			<DialogTrigger
				render={
					<button
						type="button"
						aria-label="Add relationship"
						disabled={readOnly}
						title={readOnly ? readOnlyReason : undefined}
						className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-dashed p-3 text-left text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-99 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 disabled:hover:text-muted-foreground"
					/>
				}
			>
				<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
					<IconPlus className="size-4" />
				</span>
				<span className="text-sm font-medium">Add relationship</span>
			</DialogTrigger>
			<DialogContent ref={dialogRef} className="overflow-visible sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Add relationship</DialogTitle>
					<DialogDescription>
						Search for a contact, case, or entity.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3">
					<SearchCombobox
						open={open}
						query={query}
						results={results}
						selectedResult={selectedResult}
						isWaitingForResults={isWaitingForResults}
						resultsId="relationship-search-results"
						placeholder="Search relationships…"
						emptyText="No results"
						clearAriaLabel="Clear selected relationship"
						hotkeyTargetRef={dialogRef}
						getResultId={getResultOptionId}
						getSelectedAriaLabel={(result) =>
							`Selected relationship: ${result.label}`
						}
						isResultUnavailable={isRelationshipResultUnavailable}
						onQueryChange={(nextQuery) => {
							setQuery(nextQuery);
							setError(null);
						}}
						onSelectResult={(result) => {
							setSelectedResult(result);
							setError(null);
						}}
						onClearSelection={() => setSelectedResult(null)}
						onRequestEmptyResults={() => setRecentRelationshipsRequested(true)}
						onClose={closeDialog}
						onSubmit={() => void addSelectedRelationship()}
						canSubmit={selectedResult !== null && !isAdding}
						renderResult={(result) => (
							<RelationshipResultContent result={result} />
						)}
						renderUnavailable={(result) =>
							result.unavailableReason ? (
								<span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
									<IconCircleCheckFilled className="size-4 text-accent" />
									{result.unavailableReason}
								</span>
							) : null
						}
					/>

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
						disabled={readOnly || !selectedResult || isAdding}
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

type GlobalSearchResult = FunctionReturnType<
	typeof api.globalSearch.reader.search
>[number];

type RelationshipSearchCandidate = Pick<
	GlobalSearchResult,
	"target" | "identifier" | "label" | "descriptor" | "icon"
>;

type RelationshipSearchResult = RelationshipSearchCandidate & {
	unavailableReason: string | null;
};

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

function isRelationshipResultUnavailable(result: RelationshipSearchResult) {
	return Boolean(result.unavailableReason);
}

function getUnavailableReason(
	result: RelationshipSearchCandidate,
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
