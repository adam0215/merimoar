import { IconLoader2, IconSearch, IconX } from "@tabler/icons-react";
import type { ReactNode, RefObject } from "react";
import { useSearchCombobox } from "#/hooks/use-search-combobox.ts";

export function SearchCombobox<Result>({
	open,
	query,
	results,
	selectedResult,
	isWaitingForResults,
	resultsId,
	placeholder,
	emptyText,
	clearAriaLabel,
	hotkeyTargetRef,
	getResultId,
	getSelectedAriaLabel,
	isResultUnavailable,
	onQueryChange,
	onSelectResult,
	onClearSelection,
	onRequestEmptyResults,
	onClose,
	onSubmit,
	canSubmit,
	renderResult,
	renderUnavailable,
}: {
	open: boolean;
	query: string;
	results: Result[];
	selectedResult: Result | null;
	isWaitingForResults: boolean;
	resultsId: string;
	placeholder: string;
	emptyText: string;
	clearAriaLabel: string;
	hotkeyTargetRef: RefObject<HTMLElement | null>;
	getResultId: (result: Result) => string;
	getSelectedAriaLabel: (result: Result) => string;
	isResultUnavailable: (result: Result) => boolean;
	onQueryChange: (query: string) => void;
	onSelectResult: (result: Result) => void;
	onClearSelection: () => void;
	onRequestEmptyResults?: () => void;
	onClose: () => void;
	onSubmit?: () => void;
	canSubmit?: boolean;
	renderResult: (result: Result) => ReactNode;
	renderUnavailable?: (result: Result) => ReactNode;
}) {
	const {
		clearSelection,
		handleInputFocus,
		handleQueryChange,
		highlightedIndex,
		highlightedResult,
		highlightResult,
		inputRef,
		resultsOpen,
		selectResult,
	} = useSearchCombobox({
		open,
		query,
		results,
		selectedResult,
		isWaitingForResults,
		getResultId,
		isResultUnavailable,
		onQueryChange,
		onSelectResult,
		onClearSelection,
		onRequestEmptyResults,
		onClose,
		onSubmit,
		canSubmit,
		hotkeyTargetRef,
	});

	return (
		<div className="relative">
			<div className="relative flex min-h-12 w-full items-center rounded-xl border border-input bg-input/30 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
				<input
					ref={inputRef}
					value={query}
					readOnly={selectedResult !== null}
					onChange={(event) => handleQueryChange(event.target.value)}
					onFocus={handleInputFocus}
					placeholder={placeholder}
					autoComplete="off"
					autoFocus
					role="combobox"
					aria-label={
						selectedResult ? getSelectedAriaLabel(selectedResult) : placeholder
					}
					aria-autocomplete="list"
					aria-expanded={!selectedResult && resultsOpen}
					aria-controls={resultsId}
					aria-activedescendant={
						!selectedResult && highlightedResult
							? getResultId(highlightedResult)
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
							{renderResult(selectedResult)}
						</div>
						<button
							type="button"
							onMouseDown={(event) => event.preventDefault()}
							onClick={clearSelection}
							className="mr-2 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,transform] hover:bg-muted hover:text-foreground active:scale-97"
							aria-label={clearAriaLabel}
						>
							<IconX className="size-4" />
						</button>
					</>
				) : (
					<IconSearch className="order-first ml-3 size-4 shrink-0 text-muted-foreground" />
				)}
			</div>

			{resultsOpen && !selectedResult && (
				<div
					id={resultsId}
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
							{emptyText}
						</p>
					) : (
						results.map((result, index) => {
							const unavailable = isResultUnavailable(result);
							return (
								<button
									key={getResultId(result)}
									id={getResultId(result)}
									type="button"
									role="option"
									aria-selected={index === highlightedIndex}
									disabled={unavailable}
									onMouseMove={() => highlightResult(index)}
									onMouseDown={(event) => event.preventDefault()}
									onClick={() => selectResult(result)}
									className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted aria-selected:bg-muted disabled:cursor-default disabled:opacity-50"
								>
									{renderResult(result)}
									{unavailable && renderUnavailable?.(result)}
								</button>
							);
						})
					)}
				</div>
			)}
		</div>
	);
}
