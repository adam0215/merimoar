export const ENTITY_ICON_KEYS = [
	"box",
	"user",
	"users",
	"building",
	"briefcase",
	"home",
	"estate",
	"contract",
	"invoice",
	"shield",
	"car",
	"truck",
	"package",
	"paw",
	"heartbeat",
	"calendar",
	"map-pin",
	"tools",
] as const;

export const ENTITY_FIELD_TYPES = [
	"text",
	"number",
	"boolean",
	"date",
] as const;

export const MAX_ENTITY_TYPES_PER_ORGANIZATION = 50;
export const MAX_FIELDS_PER_ENTITY_TYPE = 50;
export const MAX_ENTITIES_PER_TYPE = 100;

export type EntityIconKey = (typeof ENTITY_ICON_KEYS)[number];
export type EntityFieldType = (typeof ENTITY_FIELD_TYPES)[number];

export function normalizeEntityKey(value: string) {
	return value
		.trim()
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function normalizeEntityIdentifier(value: string) {
	return value.trim().toLocaleLowerCase("en-US");
}
