import { api } from "@merimoar/convex/api";
import type { Id } from "@merimoar/convex/data-model";
import {
	IconArrowBarToLeftDashed,
	IconArrowBarToRightDashed,
	IconCheck,
	IconCornerDownLeft,
	IconFolder,
	IconFolderPlus,
	IconLink,
	IconLoader2,
	IconUser,
} from "@tabler/icons-react";
import { useKeyHold } from "@tanstack/react-hotkeys";
import { Link } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
	type MouseEvent as ReactMouseEvent,
	type RefObject,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createStore } from "zustand/vanilla";
import { CaseStatusDot } from "#/components/case/case-status.tsx";
import { CreateCaseDialog } from "#/components/case/create-case-dialog.tsx";
import { formatShortDate } from "#/components/case/format.ts";
import type { CaseCreateOptions } from "#/components/case/types.ts";
import { UnlinkEmailThreadButton } from "#/components/case/unlink-email-thread-button.tsx";
import { Button } from "#/components/ui/button.tsx";
import { ButtonGroup } from "#/components/ui/button-group.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog.tsx";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "#/components/ui/hover-card.tsx";
import { SearchCombobox } from "#/components/ui/search-combobox.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";
import { cn } from "#/lib/utils.ts";

type ThreadDetails = NonNullable<
	FunctionReturnType<typeof api.email.reader.getThread>
>;

type CaseOption = {
	caseId: Id<"cases">;
	title: string;
	reference: string;
	isCurrent: boolean;
};

type SuggestedCaseOption = FunctionReturnType<
	typeof api.case.embedding.suggestForEmailThread
>[number] & { isCurrent: false };

type CaseSuggestionState = SuggestedCaseOption[] | "failed" | undefined;

const CASE_SUGGESTION_CACHE_TTL_MS = 5 * 60 * 1000;

type CaseSuggestionCache = {
	entries: Map<
		Id<"emailThreads">,
		{ cachedAt: number; suggestions: SuggestedCaseOption[] }
	>;
	cache: (
		threadId: Id<"emailThreads">,
		suggestions: SuggestedCaseOption[],
	) => void;
	remove: (threadId: Id<"emailThreads">) => void;
};

const caseSuggestionCache = createStore<CaseSuggestionCache>()((set) => ({
	entries: new Map(),
	cache: (threadId, suggestions) =>
		set(({ entries }) => ({
			entries: new Map(entries).set(threadId, {
				cachedAt: Date.now(),
				suggestions,
			}),
		})),
	remove: (threadId) =>
		set(({ entries }) => {
			const nextEntries = new Map(entries);
			nextEntries.delete(threadId);
			return { entries: nextEntries };
		}),
}));

export function EmailCaseActions({
	thread,
	createOptions,
	className,
}: {
	thread: ThreadDetails;
	createOptions: CaseCreateOptions | undefined;
	className?: string;
}) {
	const [createDialogOpen, setCreateDialogOpen] = useState(false);
	const [linkDialogOpen, setLinkDialogOpen] = useState(false);
	const [actionsAreTuckedAway, setActionsAreTuckedAway] = useState(false);
	const firstMessage = thread.messages[0];
	const senderContacts = useMemo(() => {
		const contactsById = new Map<
			Id<"contacts">,
			{
				_id: Id<"contacts">;
				address: string;
				name?: string;
			}
		>();
		for (const message of thread.messages) {
			if (message.direction !== "inbound") {
				continue;
			}
			contactsById.set(message.senderContactId, {
				_id: message.senderContactId,
				address: message.from.address,
				...(message.from.name ? { name: message.from.name } : {}),
			});
		}
		return [...contactsById.values()];
	}, [thread.messages]);
	const senderContactIds = senderContacts.map((contact) => contact._id);
	const updateShowButtonMagneticOffset = (
		event: ReactMouseEvent<HTMLButtonElement>,
	) => {
		if (!actionsAreTuckedAway) {
			return;
		}

		const bounds = event.currentTarget.getBoundingClientRect();
		const offsetX = (event.clientX - bounds.left - bounds.width / 2) * 0.25;
		const offsetY = (event.clientY - bounds.top - bounds.height / 2) * 0.25;
		event.currentTarget.style.translate = `${offsetX}px ${offsetY}px`;
	};
	const resetShowButtonMagneticOffset = (
		event: ReactMouseEvent<HTMLButtonElement>,
	) => {
		event.currentTarget.style.removeProperty("translate");
	};
	const toggleCaseActions = () => {
		setActionsAreTuckedAway((current) => !current);
	};
	const handleActionToggleClick = (
		event: ReactMouseEvent<HTMLButtonElement>,
	) => {
		if (event.detail > 0) {
			event.currentTarget.blur();
		}
		resetShowButtonMagneticOffset(event);
		toggleCaseActions();
	};
	const actionMotionClassName = cn(
		"transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
		actionsAreTuckedAway &&
			"translate-x-full sm:translate-x-[calc(100%+0.5rem)]",
	);
	const actionToggleLabel = actionsAreTuckedAway
		? "Show case actions"
		: "Hide case actions";

	return (
		<>
			<div
				className={cn(
					"pointer-events-none relative flex max-w-full flex-col items-end gap-2",
					className,
				)}
			>
				{thread.activeCase && (
					<div
						className={cn(
							"group/case-pill pointer-events-auto relative min-w-0 max-w-66 rounded-full border bg-background/90 shadow-lg backdrop-blur-xl",
							actionMotionClassName,
						)}
					>
						<Link
							to="/cases"
							search={{ case: thread.activeCase._id }}
							className="flex min-w-0 items-center gap-2 rounded-full p-1 text-foreground no-underline transition-[padding,transform] group-focus-within/case-pill:pr-9 group-hover/case-pill:pr-9 active:scale-97"
							aria-label={`Open linked case ${thread.activeCase.reference}`}
						>
							<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
								<IconFolder className="size-3.5" />
							</span>
							<span className="min-w-0">
								<span className="block truncate text-xs font-semibold">
									{thread.activeCase.title}
								</span>
								<span className="block text-xs text-muted-foreground">
									{thread.activeCase.reference}
								</span>
							</span>
						</Link>
						<UnlinkEmailThreadButton
							relationId={thread.activeCase.relationId}
							label={`${thread.activeCase.reference}: ${thread.activeCase.title}`}
							className="pointer-events-none absolute top-1/2 right-1 size-7 -translate-y-1/2 opacity-0 transition-opacity group-focus-within/case-pill:pointer-events-auto group-focus-within/case-pill:opacity-100 group-hover/case-pill:pointer-events-auto group-hover/case-pill:opacity-100"
						/>
					</div>
				)}

				<ButtonGroup
					className={cn(
						"pointer-events-auto rounded-4xl shadow-lg",
						actionMotionClassName,
					)}
					aria-label="Case actions"
				>
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									size="icon-sm"
									onClick={() => setLinkDialogOpen(true)}
									aria-label="Länka till befintligt case"
								/>
							}
						>
							<IconLink />
						</TooltipTrigger>
						<TooltipContent side="top">
							Länka till befintligt case
						</TooltipContent>
					</Tooltip>
					<Button size="sm" onClick={() => setCreateDialogOpen(true)}>
						<IconFolderPlus data-icon="inline-start" />
						Create case
					</Button>
				</ButtonGroup>

				<div
					className={cn(
						"group/case-actions-edge pointer-events-none absolute inset-y-0 z-10 flex w-8 items-center justify-end",
						actionsAreTuckedAway
							? "right-0 sm:-right-2"
							: "-right-4 sm:-right-6",
					)}
				>
					<button
						type="button"
						tabIndex={-1}
						aria-hidden="true"
						className="pointer-events-auto absolute inset-y-0 right-0 w-2 cursor-pointer"
						onClick={toggleCaseActions}
					/>
					<Button
						type="button"
						variant="secondary"
						size="icon-sm"
						className={cn(
							"pointer-events-none origin-right scale-50 opacity-0 shadow-md transition-[scale,opacity,translate] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover/case-actions-edge:pointer-events-auto group-hover/case-actions-edge:scale-100 group-hover/case-actions-edge:opacity-100 group-hover/case-actions-edge:duration-300 group-hover/case-actions-edge:ease-[cubic-bezier(0.34,1.56,0.64,1)] focus-visible:pointer-events-auto focus-visible:scale-100 focus-visible:opacity-100 focus-visible:duration-300 focus-visible:ease-[cubic-bezier(0.34,1.56,0.64,1)] active:translate-y-0! motion-reduce:transition-none",
							actionsAreTuckedAway ? "rounded-full" : "rounded-r-none",
						)}
						aria-label={actionToggleLabel}
						title={actionToggleLabel}
						onMouseMove={
							actionsAreTuckedAway ? updateShowButtonMagneticOffset : undefined
						}
						onMouseLeave={resetShowButtonMagneticOffset}
						onClick={handleActionToggleClick}
					>
						{actionsAreTuckedAway ? (
							<IconArrowBarToLeftDashed />
						) : (
							<IconArrowBarToRightDashed />
						)}
					</Button>
				</div>
			</div>

			<CreateCaseDialog
				key={thread.thread._id}
				options={createOptions}
				open={createDialogOpen}
				onOpenChange={setCreateDialogOpen}
				trigger={null}
				initialTitle={firstMessage?.subject || "(No subject)"}
				initialContactIds={senderContactIds}
				initialContacts={senderContacts}
				emailThreadId={thread.thread._id}
				variant="email"
				onCreated={() => setCreateDialogOpen(false)}
			/>
			<LinkEmailThreadDialog
				open={linkDialogOpen}
				onOpenChange={setLinkDialogOpen}
				threadId={thread.thread._id}
				activeCaseId={thread.activeCase?._id}
			/>
		</>
	);
}

function LinkEmailThreadDialog({
	open,
	onOpenChange,
	threadId,
	activeCaseId,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	threadId: Id<"emailThreads">;
	activeCaseId?: Id<"cases">;
}) {
	const linkEmailThread = useMutation(api.case.mutations.linkEmailThread);
	const suggestCases = useAction(api.case.embedding.suggestForEmailThread);
	const dialogRef = useRef<HTMLDivElement>(null);
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [selectedCase, setSelectedCase] = useState<CaseOption | null>(null);
	const [suggestions, setSuggestions] = useState<CaseSuggestionState>();
	const [recentCasesRequested, setRecentCasesRequested] = useState(false);
	const [isLinking, setIsLinking] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const isMetaHeld = useKeyHold("Meta");
	const normalizedQuery = query.trim();
	const visibleSuggestions = Array.isArray(suggestions)
		? suggestions.filter((suggestion) => suggestion.caseId !== activeCaseId)
		: suggestions;
	const searchResults = useQuery(
		api.globalSearch.reader.search,
		debouncedQuery ? { query: debouncedQuery } : "skip",
	);
	const recentCases = useQuery(
		api.case.reader.listRecent,
		recentCasesRequested && !normalizedQuery ? {} : "skip",
	);
	const caseOptions = useMemo(() => {
		if (debouncedQuery) {
			return (
				searchResults?.flatMap((result) =>
					result.target.kind === "case"
						? [
								{
									caseId: result.target.caseId,
									title: result.label,
									reference: result.identifier,
									isCurrent: result.target.caseId === activeCaseId,
								},
							]
						: [],
				) ?? []
			);
		}

		return (
			recentCases?.map((caseRecord) => ({
				caseId: caseRecord._id,
				title: caseRecord.title,
				reference: caseRecord.reference,
				isCurrent: caseRecord._id === activeCaseId,
			})) ?? []
		);
	}, [activeCaseId, debouncedQuery, recentCases, searchResults]);
	const waitingForSearch = normalizedQuery
		? normalizedQuery !== debouncedQuery || searchResults === undefined
		: recentCasesRequested && recentCases === undefined;

	useEffect(() => {
		const timeoutId = window.setTimeout(
			() => setDebouncedQuery(normalizedQuery),
			200,
		);
		return () => window.clearTimeout(timeoutId);
	}, [normalizedQuery]);

	useEffect(() => {
		if (!open) {
			return;
		}

		const cached = caseSuggestionCache.getState().entries.get(threadId);
		if (cached && Date.now() - cached.cachedAt < CASE_SUGGESTION_CACHE_TTL_MS) {
			setSuggestions(cached.suggestions);
			return;
		}

		caseSuggestionCache.getState().remove(threadId);
		let canceled = false;
		setSuggestions(undefined);
		void suggestCases({ threadId })
			.then((results) => {
				const nextSuggestions = results.map((suggestion) => ({
					...suggestion,
					isCurrent: false as const,
				}));
				caseSuggestionCache.getState().cache(threadId, nextSuggestions);
				if (canceled) {
					return;
				}
				setSuggestions(nextSuggestions);
			})
			.catch(() => {
				if (!canceled) {
					setSuggestions("failed");
				}
			});

		return () => {
			canceled = true;
		};
	}, [open, suggestCases, threadId]);

	function reset() {
		setQuery("");
		setDebouncedQuery("");
		setSelectedCase(null);
		setSuggestions(undefined);
		setRecentCasesRequested(false);
		setIsLinking(false);
		setError(null);
	}

	function closeDialog() {
		onOpenChange(false);
		reset();
	}

	async function linkSelectedCase() {
		if (!selectedCase || selectedCase.caseId === activeCaseId || isLinking) {
			return;
		}
		setIsLinking(true);
		setError(null);
		try {
			await linkEmailThread({ caseId: selectedCase.caseId, threadId });
			closeDialog();
		} catch (caughtError) {
			setError(
				getConvexErrorMessage(
					caughtError,
					"The email thread could not be linked.",
				),
			);
		} finally {
			setIsLinking(false);
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				onOpenChange(nextOpen);
				if (!nextOpen) {
					reset();
				}
			}}
		>
			<DialogContent ref={dialogRef} className="overflow-visible sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Link to case</DialogTitle>
					<DialogDescription>Search by title or reference.</DialogDescription>
				</DialogHeader>

				<div className="space-y-3">
					<SearchCombobox
						open={open}
						query={query}
						results={caseOptions}
						selectedResult={selectedCase}
						isWaitingForResults={waitingForSearch}
						resultsId="case-search-results"
						placeholder="Search cases…"
						emptyText="No cases found"
						clearAriaLabel="Clear selected case"
						hotkeyTargetRef={dialogRef}
						getResultId={getCaseOptionId}
						getSelectedAriaLabel={(caseOption) =>
							`Selected case: ${caseOption.title}`
						}
						isResultUnavailable={isCaseOptionUnavailable}
						onQueryChange={(nextQuery) => {
							setQuery(nextQuery);
							setError(null);
						}}
						onSelectResult={(caseOption) => {
							setSelectedCase(caseOption);
							setError(null);
						}}
						onClearSelection={() => setSelectedCase(null)}
						onRequestEmptyResults={() => setRecentCasesRequested(true)}
						onClose={closeDialog}
						onSubmit={() => void linkSelectedCase()}
						canSubmit={selectedCase !== null && !isLinking}
						renderResult={(caseOption) => (
							<CaseOptionContent caseOption={caseOption} />
						)}
						renderUnavailable={(caseOption) =>
							caseOption.isCurrent ? (
								<span className="flex size-4 shrink-0 items-center justify-center">
									<IconCheck className="size-4" />
									<span className="sr-only">Linked</span>
								</span>
							) : null
						}
					/>

					{!normalizedQuery && !selectedCase && (
						<CaseSuggestions
							suggestions={visibleSuggestions}
							container={dialogRef}
							onSelect={(caseOption) => {
								setSelectedCase(caseOption);
								setError(null);
							}}
						/>
					)}

					{error && (
						<p
							className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
							role="alert"
						>
							{error}
						</p>
					)}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={closeDialog}
						disabled={isLinking}
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={() => void linkSelectedCase()}
						disabled={!selectedCase || isLinking}
						aria-keyshortcuts="Meta+Enter Control+Enter"
					>
						{isLinking && <IconLoader2 className="animate-spin" />}
						{isMetaHeld ? (
							<>
								<IconCornerDownLeft />
								Enter
							</>
						) : (
							"Link case"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function CaseSuggestions({
	suggestions,
	container,
	onSelect,
}: {
	suggestions: CaseSuggestionState;
	container: RefObject<HTMLDivElement | null>;
	onSelect: (caseOption: CaseOption) => void;
}) {
	return (
		<div>
			<h3 className="px-1 pb-1.5 text-sm font-medium">Suggestions</h3>
			{suggestions === undefined ? (
				<div className="space-y-1">
					{Array.from({ length: 3 }, (_, index) => (
						<div
							key={index}
							className="flex items-center gap-3 rounded-xl px-3 py-2.5"
						>
							<Skeleton className="size-8 shrink-0 rounded-full" />
							<div className="min-w-0 flex-1 space-y-1.5">
								<Skeleton className="h-4 w-2/3" />
								<Skeleton className="h-3 w-1/3" />
							</div>
						</div>
					))}
				</div>
			) : suggestions === "failed" ? (
				<p className="px-3 py-4 text-center text-sm text-muted-foreground">
					Suggestions unavailable
				</p>
			) : suggestions.length > 0 ? (
				<div className="space-y-1">
					{suggestions.map((caseOption) => (
						<HoverCard key={caseOption.caseId}>
							<HoverCardTrigger
								delay={200}
								closeDelay={100}
								render={
									<button
										type="button"
										className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
										aria-label={`Select ${caseOption.reference}: ${caseOption.title}`}
										onClick={() => onSelect(caseOption)}
									/>
								}
							>
								<CaseOptionContent caseOption={caseOption} />
							</HoverCardTrigger>
							<HoverCardContent
								side="top"
								className="w-(--anchor-width)"
								container={container}
							>
								<CaseSuggestionPreview caseOption={caseOption} />
							</HoverCardContent>
						</HoverCard>
					))}
				</div>
			) : (
				<p className="px-3 py-4 text-center text-sm text-muted-foreground">
					No suggestions found
				</p>
			)}
		</div>
	);
}

function CaseSuggestionPreview({
	caseOption,
}: {
	caseOption: SuggestedCaseOption;
}) {
	return (
		<div>
			<div className="flex items-center gap-2 text-xs">
				<CaseStatusDot status={caseOption.status} className="size-1.5" />
				<span className="font-medium text-muted-foreground">
					{caseOption.reference}
				</span>
				<time className="ml-auto text-muted-foreground">
					{formatShortDate(caseOption.lastActivityAt)}
				</time>
			</div>
			<h4 className="mt-1.5 text-base leading-5 font-semibold">
				{caseOption.title}
			</h4>
			<div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
				<IconUser className="size-3.5" />
				<span className="truncate">{caseOption.ownerName ?? "Unassigned"}</span>
				{caseOption.dueAt && (
					<>
						<span aria-hidden>·</span>
						<span className="truncate">
							Due {formatShortDate(caseOption.dueAt)}
						</span>
					</>
				)}
			</div>
			<p className="mt-3 line-clamp-5 border-t pt-3 text-sm leading-5 text-muted-foreground">
				{caseOption.description || "No description"}
			</p>
		</div>
	);
}

function CaseOptionContent({ caseOption }: { caseOption: CaseOption }) {
	return (
		<>
			<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
				<IconFolder className="size-4" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="block truncate text-sm font-medium">
					{caseOption.title}
				</span>
				<span className="block text-xs text-muted-foreground">
					{caseOption.reference}
				</span>
			</span>
		</>
	);
}

function getCaseOptionId(caseOption: CaseOption) {
	return `case-search-result-${caseOption.caseId}`;
}

function isCaseOptionUnavailable(caseOption: CaseOption) {
	return caseOption.isCurrent;
}
