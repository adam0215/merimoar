import type { Doc } from "../../../convex/_generated/dataModel";

export type PaginationStatus =
	| "LoadingFirstPage"
	| "CanLoadMore"
	| "LoadingMore"
	| "Exhausted";

export type CaseListItem = {
	case: Doc<"cases">;
	owner: Doc<"organizationMembers"> | null;
};

export type CaseDetail = {
	case: Doc<"cases">;
	owner: Doc<"organizationMembers"> | null;
	events: Array<{
		event: Doc<"caseEvents">;
		author: Doc<"organizationMembers"> | null;
	}>;
	contacts: Array<{
		relation: Doc<"caseContactRelations">;
		contact: Doc<"contacts"> | null;
	}>;
	entities: Array<{
		relation: Doc<"caseEntityRelations">;
		entity: Doc<"entities"> | null;
		entityType: Doc<"entityTypes"> | null;
	}>;
};

export type CaseCreateOptions = {
	members: Doc<"organizationMembers">[];
	contacts: Doc<"contacts">[];
	entityTypes: Array<{
		entityType: Doc<"entityTypes">;
		entities: Doc<"entities">[];
	}>;
};
