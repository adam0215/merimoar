import {
	IconCheck,
	IconCornerDownLeft,
	IconFolder,
	IconFolderPlus,
	IconLink,
	IconLoader2,
} from "@tabler/icons-react";
import { useKeyHold } from "@tanstack/react-hotkeys";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo, useRef, useState } from "react";
import { CreateCaseDialog } from "#/components/case/create-case-dialog.tsx";
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
import { SearchCombobox } from "#/components/ui/search-combobox.tsx";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type ThreadDetails = NonNullable<
	FunctionReturnType<typeof api.email.reader.getThread>
>;

type CaseOption = {
	caseId: Id<"cases">;
	title: string;
	reference: string;
	isCurrent: boolean;
};

export function EmailCaseActions({
	thread,
	createOptions,
}: {
	thread: ThreadDetails;
	createOptions: CaseCreateOptions | undefined;
}) {
	const [createDialogOpen, setCreateDialogOpen] = useState(false);
	const [linkDialogOpen, setLinkDialogOpen] = useState(false);
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
			contactsById.set(message.senderContactId, {
				_id: message.senderContactId,
				address: message.from.address,
				...(message.from.name ? { name: message.from.name } : {}),
			});
		}
		return [...contactsById.values()];
	}, [thread.messages]);
	const senderContactIds = senderContacts.map((contact) => contact._id);

	return (
		<>
			<div className="pointer-events-none absolute right-4 bottom-4 z-30 flex max-w-[calc(100%-2rem)] flex-col items-end gap-2 sm:right-6 sm:bottom-6">
				{thread.activeCase && (
					<div className="group/case-pill pointer-events-auto relative min-w-0 max-w-66 rounded-full border bg-background/90 shadow-lg backdrop-blur-xl">
						<Link
							to="/cases"
							search={{ case: thread.activeCase._id }}
							className="flex min-w-0 items-center gap-2 rounded-full p-1 text-foreground no-underline transition-[padding,transform] group-focus-within/case-pill:pr-9 group-hover/case-pill:pr-9 active:scale-97"
							aria-label={`Open linked case ${thread.activeCase.reference}`}
						>
							<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
								<IconFolder className="size-3.5" />
							</span>
							<span className="min-w-0 pr-4">
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
					className="pointer-events-auto rounded-4xl shadow-lg"
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
	const dialogRef = useRef<HTMLDivElement>(null);
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [selectedCase, setSelectedCase] = useState<CaseOption | null>(null);
	const [recentCasesRequested, setRecentCasesRequested] = useState(false);
	const [isLinking, setIsLinking] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const isMetaHeld = useKeyHold("Meta");
	const normalizedQuery = query.trim();
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

	function reset() {
		setQuery("");
		setDebouncedQuery("");
		setSelectedCase(null);
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
