type SearchResultDescriptionInput = {
	target: { kind: "contact" | "case" | "entity" };
	label: string;
	identifier: string;
	descriptor: string;
};

export function getSearchResultDescription(
	result: SearchResultDescriptionInput,
) {
	if (result.target.kind === "contact") {
		return result.label === result.identifier
			? result.descriptor
			: result.identifier;
	}

	return result.target.kind === "entity"
		? `${result.descriptor} · ${result.identifier}`
		: `${result.identifier} · ${result.descriptor}`;
}
