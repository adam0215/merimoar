import { useHotkeys } from "@tanstack/react-hotkeys";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

export function useSearchCombobox<Result>({
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
	canSubmit = false,
	hotkeyTargetRef,
}: {
	open: boolean;
	query: string;
	results: Result[];
	selectedResult: Result | null;
	isWaitingForResults: boolean;
	getResultId: (result: Result) => string;
	isResultUnavailable: (result: Result) => boolean;
	onQueryChange: (query: string) => void;
	onSelectResult: (result: Result) => void;
	onClearSelection: () => void;
	onRequestEmptyResults?: () => void;
	onClose: () => void;
	onSubmit?: () => void;
	canSubmit?: boolean;
	hotkeyTargetRef: RefObject<HTMLElement | null>;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [resultsOpen, setResultsOpen] = useState(false);
	const [highlightedIndex, setHighlightedIndex] = useState(-1);
	const normalizedQuery = query.trim();
	const highlightedResult =
		highlightedIndex >= 0 ? results[highlightedIndex] : undefined;

	useEffect(() => {
		if (!open) {
			setResultsOpen(false);
			setHighlightedIndex(-1);
		}
	}, [open]);

	useEffect(() => {
		if (!resultsOpen || isWaitingForResults) {
			setHighlightedIndex(-1);
			return;
		}

		setHighlightedIndex((currentIndex) => {
			const currentResult = results[currentIndex];
			if (currentResult && !isResultUnavailable(currentResult)) {
				return currentIndex;
			}
			return results.findIndex((result) => !isResultUnavailable(result));
		});
	}, [isResultUnavailable, isWaitingForResults, results, resultsOpen]);

	function handleQueryChange(nextQuery: string) {
		onQueryChange(nextQuery);
		setResultsOpen(Boolean(nextQuery.trim()));
	}

	function handleInputFocus() {
		if (!selectedResult && normalizedQuery) {
			setResultsOpen(true);
		}
	}

	function selectResult(result: Result) {
		if (isResultUnavailable(result)) {
			return;
		}
		onSelectResult(result);
		setResultsOpen(false);
	}

	function clearSelection() {
		onClearSelection();
		setResultsOpen(Boolean(normalizedQuery));
	}

	function highlightResult(index: number) {
		const result = results[index];
		if (result && !isResultUnavailable(result)) {
			setHighlightedIndex(index);
		}
	}

	function moveHighlight(direction: 1 | -1) {
		if (results.length === 0) {
			return;
		}

		let nextIndex = highlightedIndex;
		for (let offset = 0; offset < results.length; offset += 1) {
			nextIndex = (nextIndex + direction + results.length) % results.length;
			const nextResult = results[nextIndex];
			if (nextResult && !isResultUnavailable(nextResult)) {
				setHighlightedIndex(nextIndex);
				document
					.getElementById(getResultId(nextResult))
					?.scrollIntoView({ block: "nearest" });
				return;
			}
		}
	}

	function openOrMoveToNextResult() {
		if (!resultsOpen) {
			if (!normalizedQuery) {
				onRequestEmptyResults?.();
			}
			if (normalizedQuery || onRequestEmptyResults) {
				setResultsOpen(true);
			}
			return;
		}

		moveHighlight(1);
	}

	useHotkeys(
		[
			{
				hotkey: "ArrowDown",
				callback: openOrMoveToNextResult,
				options: {
					enabled:
						open &&
						selectedResult === null &&
						(!resultsOpen || !isWaitingForResults),
					meta: {
						name: "Next search result",
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
						name: "Previous search result",
						description: "Highlight the previous search result",
					},
				},
			},
			{
				hotkey: "Enter",
				callback: () => {
					if (highlightedResult) {
						selectResult(highlightedResult);
					}
				},
				options: {
					enabled:
						open &&
						resultsOpen &&
						highlightedIndex >= 0 &&
						!isWaitingForResults,
					meta: {
						name: "Select search result",
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
						onClose();
					}
				},
				options: {
					enabled: open,
					requireReset: true,
					meta: {
						name: "Close search",
						description: "Close results first, then the dialog",
					},
				},
			},
			{
				hotkey: "Mod+Enter",
				callback: () => onSubmit?.(),
				options: {
					enabled: open && canSubmit,
					meta: {
						name: "Submit selection",
						description: "Submit the selected search result",
					},
				},
			},
		],
		{
			target: hotkeyTargetRef,
			ignoreInputs: false,
			preventDefault: true,
			stopPropagation: true,
		},
	);

	return {
		clearSelection,
		handleInputFocus,
		handleQueryChange,
		highlightedIndex,
		highlightedResult,
		highlightResult,
		inputRef,
		resultsOpen,
		selectResult,
	};
}
