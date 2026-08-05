export const ACME_DATASET_VERSION = "acme-residential-management-v3" as const;
export const ACME_DEPLOYMENT_NAME = "cool-curlew-981" as const;
export const ACME_DEPLOYMENT_URL =
	"https://cool-curlew-981.convex.cloud" as const;
export const ACME_WORKOS_ORGANIZATION_ID =
	"org_01KYNRWVMDEPP8JRTNV5PAJNES" as const;

const timestamp = (value: string) => {
	const parsed = Date.parse(value);
	if (!Number.isFinite(parsed)) {
		throw new Error(`Invalid Acme seed timestamp: ${value}`);
	}
	return parsed;
};

export const ACME_INBOX = {
	displayName: "Acme Kundcenter",
	address: "service@acme.seed.invalid",
} as const;

export type AcmeContactSeed = {
	key: string;
	name: string;
	address: string;
};

export const ACME_CONTACTS = [
	{
		key: "hanna-ekstrom",
		name: "Hanna Ekström",
		address: "hanna.ekstrom@vasterhamn.seed.invalid",
	},
	{
		key: "oskar-nyberg",
		name: "Oskar Nyberg",
		address: "oskar.nyberg@vasterhamn.seed.invalid",
	},
	{
		key: "jonas-vik",
		name: "Jonas Vik",
		address: "jonas.vik@portservice.seed.invalid",
	},
	{
		key: "liv-andersson",
		name: "Liv Andersson",
		address: "liv.andersson@sjoglantan.seed.invalid",
	},
	{
		key: "daniel-berg",
		name: "Daniel Berg",
		address: "daniel.berg@gotadrift.seed.invalid",
	},
	{
		key: "selma-noren",
		name: "Selma Norén",
		address: "selma.noren@vasterhamn.seed.invalid",
	},
	{
		key: "karim-mansour",
		name: "Karim Mansour",
		address: "karim.mansour@boende.seed.invalid",
	},
	{
		key: "maja-lind",
		name: "Maja Lind",
		address: "maja.lind@boende.seed.invalid",
	},
	{
		key: "fredrik-holm",
		name: "Fredrik Holm",
		address: "fredrik.holm@boende.seed.invalid",
	},
	{
		key: "elin-rydh",
		name: "Elin Rydh",
		address: "elin.rydh@hisspartner.seed.invalid",
	},
	{
		key: "maria-hult",
		name: "Maria Hult",
		address: "maria.hult@teaterkajen.seed.invalid",
	},
	{
		key: "per-rahm",
		name: "Per Rahm",
		address: "per.rahm@brandteknik.seed.invalid",
	},
] as const satisfies readonly AcmeContactSeed[];

export type AcmeEntityFieldSeed = {
	key: string;
	label: string;
	valueType: "text" | "number" | "boolean" | "date";
	required: boolean;
};

export type AcmeEntityTypeSeed = {
	key: string;
	name: string;
	pluralName: string;
	identifierLabel: string;
	description: string;
	icon: "building" | "briefcase" | "tools";
	fields: readonly AcmeEntityFieldSeed[];
};

export const ACME_ENTITY_TYPES = [
	{
		key: "fastighetsagare",
		name: "Fastighetsägare",
		pluralName: "Fastighetsägare",
		identifierLabel: "Kundnummer",
		description:
			"Bostadsrättsföreningar och bostadsbolag som har gett Acme ett förvaltningsuppdrag.",
		icon: "briefcase",
		fields: [
			{
				key: "organizationNumber",
				label: "Organisationsnummer",
				valueType: "text",
				required: true,
			},
			{
				key: "ownerForm",
				label: "Ägarform",
				valueType: "text",
				required: true,
			},
			{
				key: "assignmentScope",
				label: "Förvaltningsuppdrag",
				valueType: "text",
				required: true,
			},
			{
				key: "activeContract",
				label: "Aktivt avtal",
				valueType: "boolean",
				required: true,
			},
			{
				key: "contractStart",
				label: "Avtalsstart",
				valueType: "date",
				required: true,
			},
		],
	},
	{
		key: "fastighet",
		name: "Fastighet",
		pluralName: "Fastigheter",
		identifierLabel: "Fastighetsbeteckning",
		description:
			"Bostadsfastigheter som Acme har ett aktivt förvaltningsuppdrag för.",
		icon: "building",
		fields: [
			{
				key: "address",
				label: "Besöksadress",
				valueType: "text",
				required: true,
			},
			{
				key: "housingForm",
				label: "Boendeform",
				valueType: "text",
				required: true,
			},
			{
				key: "homes",
				label: "Antal bostäder",
				valueType: "number",
				required: true,
			},
			{
				key: "constructionYear",
				label: "Byggår",
				valueType: "number",
				required: true,
			},
			{
				key: "activeManagement",
				label: "Aktivt förvaltningsuppdrag",
				valueType: "boolean",
				required: true,
			},
			{
				key: "managementStart",
				label: "Förvaltningsstart",
				valueType: "date",
				required: true,
			},
		],
	},
	{
		key: "leverantor",
		name: "Leverantör",
		pluralName: "Leverantörer",
		identifierLabel: "Leverantörsnummer",
		description:
			"Ramavtalsleverantörer som Acme anlitar för specialistinsatser.",
		icon: "tools",
		fields: [
			{
				key: "organizationNumber",
				label: "Organisationsnummer",
				valueType: "text",
				required: true,
			},
			{
				key: "specialty",
				label: "Kompetensområde",
				valueType: "text",
				required: true,
			},
			{
				key: "responseHours",
				label: "Inställelsetid timmar",
				valueType: "number",
				required: true,
			},
			{
				key: "frameworkAgreement",
				label: "Ramavtal aktivt",
				valueType: "boolean",
				required: true,
			},
			{
				key: "agreementEnds",
				label: "Avtal till och med",
				valueType: "date",
				required: true,
			},
		],
	},
] as const satisfies readonly AcmeEntityTypeSeed[];

export type AcmeEntityValueSeed =
	| { fieldKey: string; kind: "text"; value: string }
	| { fieldKey: string; kind: "number"; value: number }
	| { fieldKey: string; kind: "boolean"; value: boolean }
	| { fieldKey: string; kind: "date"; value: number };

export type AcmeEntitySeed = {
	key: string;
	entityTypeKey: string;
	identifier: string;
	displayName: string;
	values: readonly AcmeEntityValueSeed[];
};

export const ACME_ENTITIES = [
	{
		key: "owner-vasterhamn",
		entityTypeKey: "fastighetsagare",
		identifier: "K-1047",
		displayName: "Västerhamn Bostäder AB",
		values: [
			{ fieldKey: "organizationNumber", kind: "text", value: "559188-4721" },
			{ fieldKey: "ownerForm", kind: "text", value: "Privat bostadsbolag" },
			{
				fieldKey: "assignmentScope",
				kind: "text",
				value: "Teknisk förvaltning och fastighetsservice",
			},
			{ fieldKey: "activeContract", kind: "boolean", value: true },
			{
				fieldKey: "contractStart",
				kind: "date",
				value: timestamp("2024-01-01T00:00:00.000Z"),
			},
		],
	},
	{
		key: "owner-sjoglantan",
		entityTypeKey: "fastighetsagare",
		identifier: "K-1021",
		displayName: "Brf Sjögläntan",
		values: [
			{ fieldKey: "organizationNumber", kind: "text", value: "769641-8834" },
			{ fieldKey: "ownerForm", kind: "text", value: "Bostadsrättsförening" },
			{
				fieldKey: "assignmentScope",
				kind: "text",
				value: "Teknisk förvaltning och underhållsplanering",
			},
			{ fieldKey: "activeContract", kind: "boolean", value: true },
			{
				fieldKey: "contractStart",
				kind: "date",
				value: timestamp("2023-09-01T00:00:00.000Z"),
			},
		],
	},
	{
		key: "owner-teaterkajen",
		entityTypeKey: "fastighetsagare",
		identifier: "K-1103",
		displayName: "Brf Teaterkajen",
		values: [
			{ fieldKey: "organizationNumber", kind: "text", value: "769644-3059" },
			{ fieldKey: "ownerForm", kind: "text", value: "Bostadsrättsförening" },
			{
				fieldKey: "assignmentScope",
				kind: "text",
				value: "Teknisk förvaltning och systematiskt brandskyddsarbete",
			},
			{ fieldKey: "activeContract", kind: "boolean", value: true },
			{
				fieldKey: "contractStart",
				kind: "date",
				value: timestamp("2025-11-01T00:00:00.000Z"),
			},
		],
	},
	{
		key: "property-ankaret",
		entityTypeKey: "fastighet",
		identifier: "Göteborg Ankaret 2:14",
		displayName: "Kvarteret Ankaret",
		values: [
			{ fieldKey: "address", kind: "text", value: "Skeppsgatan 42, Göteborg" },
			{ fieldKey: "housingForm", kind: "text", value: "Hyresrätt" },
			{ fieldKey: "homes", kind: "number", value: 84 },
			{ fieldKey: "constructionYear", kind: "number", value: 1988 },
			{ fieldKey: "activeManagement", kind: "boolean", value: true },
			{
				fieldKey: "managementStart",
				kind: "date",
				value: timestamp("2024-01-01T00:00:00.000Z"),
			},
		],
	},
	{
		key: "property-sjoglantan",
		entityTypeKey: "fastighet",
		identifier: "Göteborg Sjögläntan 3:17",
		displayName: "Sjögläntan",
		values: [
			{ fieldKey: "address", kind: "text", value: "Sjöviksgatan 18, Göteborg" },
			{ fieldKey: "housingForm", kind: "text", value: "Bostadsrätt" },
			{ fieldKey: "homes", kind: "number", value: 72 },
			{ fieldKey: "constructionYear", kind: "number", value: 1992 },
			{ fieldKey: "activeManagement", kind: "boolean", value: true },
			{
				fieldKey: "managementStart",
				kind: "date",
				value: timestamp("2023-09-01T00:00:00.000Z"),
			},
		],
	},
	{
		key: "property-magasinet",
		entityTypeKey: "fastighet",
		identifier: "Göteborg Magasinet 5:8",
		displayName: "Kvarteret Magasinet",
		values: [
			{
				fieldKey: "address",
				kind: "text",
				value: "Packhusplatsen 4, Göteborg",
			},
			{ fieldKey: "housingForm", kind: "text", value: "Hyresrätt" },
			{ fieldKey: "homes", kind: "number", value: 46 },
			{ fieldKey: "constructionYear", kind: "number", value: 1929 },
			{ fieldKey: "activeManagement", kind: "boolean", value: true },
			{
				fieldKey: "managementStart",
				kind: "date",
				value: timestamp("2025-02-01T00:00:00.000Z"),
			},
		],
	},
	{
		key: "property-teaterkajen",
		entityTypeKey: "fastighet",
		identifier: "Göteborg Masthugget 43:12",
		displayName: "Teaterkajen",
		values: [
			{
				fieldKey: "address",
				kind: "text",
				value: "Kajpromenaden 16, Göteborg",
			},
			{ fieldKey: "housingForm", kind: "text", value: "Bostadsrätt" },
			{ fieldKey: "homes", kind: "number", value: 58 },
			{ fieldKey: "constructionYear", kind: "number", value: 2006 },
			{ fieldKey: "activeManagement", kind: "boolean", value: true },
			{
				fieldKey: "managementStart",
				kind: "date",
				value: timestamp("2025-11-01T00:00:00.000Z"),
			},
		],
	},
	{
		key: "supplier-portservice",
		entityTypeKey: "leverantor",
		identifier: "L-201",
		displayName: "Västkust Portservice AB",
		values: [
			{ fieldKey: "organizationNumber", kind: "text", value: "559014-7286" },
			{
				fieldKey: "specialty",
				kind: "text",
				value: "Garageportar och entrépartier",
			},
			{ fieldKey: "responseHours", kind: "number", value: 4 },
			{ fieldKey: "frameworkAgreement", kind: "boolean", value: true },
			{
				fieldKey: "agreementEnds",
				kind: "date",
				value: timestamp("2027-12-31T00:00:00.000Z"),
			},
		],
	},
	{
		key: "supplier-gotadrift",
		entityTypeKey: "leverantor",
		identifier: "L-203",
		displayName: "Göta Driftteknik AB",
		values: [
			{ fieldKey: "organizationNumber", kind: "text", value: "559145-6306" },
			{
				fieldKey: "specialty",
				kind: "text",
				value: "Värme, varmvatten och ventilation",
			},
			{ fieldKey: "responseHours", kind: "number", value: 4 },
			{ fieldKey: "frameworkAgreement", kind: "boolean", value: true },
			{
				fieldKey: "agreementEnds",
				kind: "date",
				value: timestamp("2027-09-30T00:00:00.000Z"),
			},
		],
	},
	{
		key: "supplier-hisspartner",
		entityTypeKey: "leverantor",
		identifier: "L-204",
		displayName: "Västkust Hisspartner AB",
		values: [
			{ fieldKey: "organizationNumber", kind: "text", value: "556812-9471" },
			{ fieldKey: "specialty", kind: "text", value: "Person- och varuhissar" },
			{ fieldKey: "responseHours", kind: "number", value: 2 },
			{ fieldKey: "frameworkAgreement", kind: "boolean", value: true },
			{
				fieldKey: "agreementEnds",
				kind: "date",
				value: timestamp("2027-06-30T00:00:00.000Z"),
			},
		],
	},
	{
		key: "supplier-brandteknik",
		entityTypeKey: "leverantor",
		identifier: "L-207",
		displayName: "Brandteknik Väst AB",
		values: [
			{ fieldKey: "organizationNumber", kind: "text", value: "559077-2018" },
			{
				fieldKey: "specialty",
				kind: "text",
				value: "Brandlarm och detektorsystem",
			},
			{ fieldKey: "responseHours", kind: "number", value: 1 },
			{ fieldKey: "frameworkAgreement", kind: "boolean", value: true },
			{
				fieldKey: "agreementEnds",
				kind: "date",
				value: timestamp("2028-01-31T00:00:00.000Z"),
			},
		],
	},
] as const satisfies readonly AcmeEntitySeed[];

export type AcmeCaseSeed = {
	reference: string;
	title: string;
	description: string;
	initialNote: string;
	status: "needs_attention" | "waiting" | "clear" | "open" | "closed";
	owner: "primary" | null;
	createdAt: number;
	dueAt: number | null;
	contactKeys: readonly string[];
	entityKeys: readonly string[];
	history: readonly {
		occurredAt: number;
		body: string;
	}[];
};

export const ACME_CASES = [
	{
		reference: "ACM-26071",
		title: "Garageporten stannar i halvöppet läge",
		description:
			"Garageporten till Kvarteret Ankarets boendegarage stannar intermittent. En tillfällig sensor har monterats, men porten får bara köras under uppsikt tills permanent sats är beslutad.",
		initialNote:
			"Prioritera boendesäkerhet och skilj funktionsfelet från den rapporterade påkörningen.",
		status: "needs_attention",
		owner: "primary",
		createdAt: timestamp("2026-07-21T06:50:00.000Z"),
		dueAt: timestamp("2026-08-01T14:00:00.000Z"),
		contactKeys: ["hanna-ekstrom", "oskar-nyberg", "jonas-vik"],
		entityKeys: [
			"owner-vasterhamn",
			"property-ankaret",
			"supplier-portservice",
		],
		history: [
			{
				occurredAt: timestamp("2026-07-21T06:52:00.000Z"),
				body: "Tilldelat nuvarande Acme-handläggare.",
			},
			{
				occurredAt: timestamp("2026-07-22T09:30:00.000Z"),
				body: "Status ändrad från Open till Needs attention efter fortsatt stopp i manuell drift.",
			},
		],
	},
	{
		reference: "ACM-26072",
		title: "Påkörd säkerhetsskena vid garageporten",
		description:
			"Kvarteret Ankarets områdesvärd har rapporterat att en flyttbil träffade garageportens styrskena. Incidentrapport och försäkringsuppgifter inväntas innan permanent reparation beställs.",
		initialNote:
			"Bevara skadehändelsen separat från portens tidigare intermittenta driftfel och dra ingen slutsats om betalningsansvar.",
		status: "waiting",
		owner: "primary",
		createdAt: timestamp("2026-07-22T11:20:00.000Z"),
		dueAt: timestamp("2026-08-04T12:00:00.000Z"),
		contactKeys: ["hanna-ekstrom", "oskar-nyberg", "jonas-vik"],
		entityKeys: [
			"owner-vasterhamn",
			"property-ankaret",
			"supplier-portservice",
		],
		history: [
			{
				occurredAt: timestamp("2026-07-22T11:22:00.000Z"),
				body: "Tilldelat nuvarande Acme-handläggare.",
			},
			{
				occurredAt: timestamp("2026-07-23T08:30:00.000Z"),
				body: "Status ändrad från Open till Waiting i väntan på signerad incidentrapport.",
			},
		],
	},
	{
		reference: "ACM-26073",
		title: "Tvist om jourdebitering för garageporten",
		description:
			"Västerhamn Bostäder bestrider faktura JD-8441. Leverantören uppger muntligt godkännande från områdesvärden, medan fastighetsägarens avtalsansvariga nekar beställning utöver akut skyddsåtgärd.",
		initialNote:
			"Dra ingen slutsats om betalningsansvar innan båda mejltrådarna och ramavtalets beställningsrätt har granskats.",
		status: "needs_attention",
		owner: null,
		createdAt: timestamp("2026-07-24T09:15:00.000Z"),
		dueAt: timestamp("2026-08-05T12:00:00.000Z"),
		contactKeys: ["hanna-ekstrom", "oskar-nyberg", "jonas-vik"],
		entityKeys: [
			"owner-vasterhamn",
			"property-ankaret",
			"supplier-portservice",
		],
		history: [
			{
				occurredAt: timestamp("2026-07-25T10:00:00.000Z"),
				body: "Status ändrad från Open till Needs attention efter motstridiga uppgifter om beställningen.",
			},
		],
	},
	{
		reference: "ACM-26077",
		title: "Låg inomhustemperatur i lägenhet 3-1202",
		description:
			"Hyresgästen i lägenhet 3-1202 i Kvarteret Ankaret rapporterar 17,8–18,1 °C i vardagsrummet och en kall radiator. En jämförelselägenhet på samma våningsplan håller normal temperatur, medan undercentral och trapphusgivare inte visar någon generell avvikelse.",
		initialNote:
			"Håll isär hyresgästens upplevelse, lokala givarvärden och fastighetens centrala driftdata. Avgör inte om felet är lokalt eller byggnadsövergripande innan radiator och rumsgivare har kontrollerats på plats.",
		status: "needs_attention",
		owner: "primary",
		createdAt: timestamp("2026-08-01T06:48:00.000Z"),
		dueAt: timestamp("2026-08-03T10:00:00.000Z"),
		contactKeys: ["maja-lind", "fredrik-holm", "oskar-nyberg", "daniel-berg"],
		entityKeys: ["owner-vasterhamn", "property-ankaret", "supplier-gotadrift"],
		history: [
			{
				occurredAt: timestamp("2026-08-01T06:50:00.000Z"),
				body: "Tilldelat nuvarande Acme-handläggare.",
			},
			{
				occurredAt: timestamp("2026-08-01T10:35:00.000Z"),
				body: "Status ändrad från Open till Needs attention efter bekräftat lågt lokalt mätvärde och bokad kontroll i lägenheten.",
			},
		],
	},
	{
		reference: "ACM-26061",
		title: "Återkommande varmvattenfall kvällstid",
		description:
			"Boende i Sjögläntan får 38–41 °C tappvarmvatten mellan 19:30 och 21:30. Temperaturen återhämtar sig när belastningen sjunker.",
		initialNote:
			"Jämför nya loggar med regulatorbytet i ACM-26044 innan ytterligare komponenter beställs.",
		status: "open",
		owner: "primary",
		createdAt: timestamp("2026-07-15T08:20:00.000Z"),
		dueAt: timestamp("2026-08-03T10:00:00.000Z"),
		contactKeys: ["liv-andersson", "daniel-berg"],
		entityKeys: [
			"owner-sjoglantan",
			"property-sjoglantan",
			"supplier-gotadrift",
		],
		history: [
			{
				occurredAt: timestamp("2026-07-15T08:22:00.000Z"),
				body: "Tilldelat nuvarande Acme-handläggare.",
			},
		],
	},
	{
		reference: "ACM-26044",
		title: "Regulatorbyte och återställning av värmekurva",
		description:
			"Regulatorn i Sjögläntans undercentral byttes efter återkommande omstarter. Värmekurva 1,2 och varmvattenbörvärde 55 °C verifierades vid avslut.",
		initialNote:
			"Historiskt avslutat arbete; använd som jämförelse om samma undercentral får nya symptom.",
		status: "closed",
		owner: "primary",
		createdAt: timestamp("2026-06-25T07:45:00.000Z"),
		dueAt: null,
		contactKeys: ["liv-andersson", "daniel-berg"],
		entityKeys: [
			"owner-sjoglantan",
			"property-sjoglantan",
			"supplier-gotadrift",
		],
		history: [
			{
				occurredAt: timestamp("2026-06-25T07:47:00.000Z"),
				body: "Tilldelat nuvarande Acme-handläggare.",
			},
			{
				occurredAt: timestamp("2026-06-26T14:10:00.000Z"),
				body: "Status ändrad från Open till Waiting medan nytt reglerkort levererades.",
			},
			{
				occurredAt: timestamp("2026-06-30T15:40:00.000Z"),
				body: "Status ändrad från Waiting till Closed efter verifierad provdrift.",
			},
		],
	},
	{
		reference: "ACM-26069",
		title: "Hiss B slår tillbaka i dörrläge 3",
		description:
			"Hiss B i Kvarteret Magasinet öppnar om på plan 3. Leverantörens mätning pekar på slitage i dörrmaskinen och rekommenderar byte, men ingen offert har ännu begärts eller skapats.",
		initialNote:
			"Underlaget räcker för att begära en icke-bindande offert för dörrmaskinen MAG-HISS-B. En offertförfrågan är inte en beställning och får inte innebära offertaccept, inköp eller godkännande av arbete.",
		status: "needs_attention",
		owner: "primary",
		createdAt: timestamp("2026-07-19T12:40:00.000Z"),
		dueAt: timestamp("2026-08-04T09:00:00.000Z"),
		contactKeys: ["selma-noren", "karim-mansour", "elin-rydh"],
		entityKeys: [
			"owner-vasterhamn",
			"property-magasinet",
			"supplier-hisspartner",
		],
		history: [
			{
				occurredAt: timestamp("2026-07-19T12:42:00.000Z"),
				body: "Tilldelat nuvarande Acme-handläggare.",
			},
			{
				occurredAt: timestamp("2026-07-21T16:20:00.000Z"),
				body: "Status ändrad från Open till Needs attention när mätningen visade behov av en formell offertförfrågan.",
			},
		],
	},
	{
		reference: "ACM-26075",
		title: "Falsklarm efter dammande lägenhetsrenovering",
		description:
			"Brf Teaterkajen fick brandlarm från zon 4 efter golvslipning i lägenhet 4-1202. Styrelsen uppger att arbetet var anmält, men Brandteknik hittar ingen beställning om frånkoppling.",
		initialNote:
			"Verifiera tid, zon och beställningsväg. Skapa inte en säkerhetsmässig eller ekonomisk slutsats av enbart styrelsens eller leverantörens mejl.",
		status: "needs_attention",
		owner: null,
		createdAt: timestamp("2026-07-27T07:30:00.000Z"),
		dueAt: timestamp("2026-08-02T15:00:00.000Z"),
		contactKeys: ["maria-hult", "per-rahm"],
		entityKeys: [
			"owner-teaterkajen",
			"property-teaterkajen",
			"supplier-brandteknik",
		],
		history: [
			{
				occurredAt: timestamp("2026-07-28T11:00:00.000Z"),
				body: "Status ändrad från Open till Needs attention när frånkopplingsbeställning inte kunde styrkas.",
			},
		],
	},
	{
		reference: "ACM-26038",
		title: "Planerat filterbyte i TA2 verifierat",
		description:
			"Det planerade filterbytet i Kvarteret Magasinets ventilationsaggregat TA2 är utfört enligt 2026 års underhållsplan. Sluttryckfall 82 Pa och inga kvarstående driftlarm noterades.",
		initialNote:
			"Dokumentera utfallet som genomfört planerat underhåll och lämna i Clear för fastighetsägarens slutliga kontroll.",
		status: "clear",
		owner: "primary",
		createdAt: timestamp("2026-06-18T06:55:00.000Z"),
		dueAt: null,
		contactKeys: ["selma-noren", "daniel-berg"],
		entityKeys: [
			"owner-vasterhamn",
			"property-magasinet",
			"supplier-gotadrift",
		],
		history: [
			{
				occurredAt: timestamp("2026-06-18T06:57:00.000Z"),
				body: "Tilldelat nuvarande Acme-handläggare.",
			},
			{
				occurredAt: timestamp("2026-06-18T15:20:00.000Z"),
				body: "Status ändrad från Open till Clear efter dokumenterad funktionskontroll.",
			},
		],
	},
] as const satisfies readonly AcmeCaseSeed[];

export const ACME_CASE_RELATIONS = [
	["ACM-26071", "ACM-26072"],
	["ACM-26071", "ACM-26073"],
	["ACM-26044", "ACM-26061"],
] as const satisfies readonly (readonly [string, string])[];

type AcmeEmailMessageBaseSeed = {
	key: string;
	sentAt: number;
	body: string;
	ccContactKeys?: readonly string[];
};

export type AcmeInboundEmailMessageSeed = AcmeEmailMessageBaseSeed & {
	direction: "inbound";
	fromContactKey: string;
};

export type AcmeOutboundEmailMessageSeed = AcmeEmailMessageBaseSeed & {
	direction: "outbound";
	toContactKeys: readonly string[];
};

export type AcmeEmailMessageSeed =
	| AcmeInboundEmailMessageSeed
	| AcmeOutboundEmailMessageSeed;

export type AcmeEmailThreadSeed = {
	key: string;
	caseReference: string | null;
	subject: string;
	unread: boolean;
	messages: readonly AcmeEmailMessageSeed[];
};

export const ACME_EMAIL_THREADS = [
	{
		key: "ankaret-garageport-stopp",
		caseReference: "ACM-26071",
		subject: "Garageporten stannar halvöppen – Kvarteret Ankaret",
		unread: true,
		messages: [
			{
				key: "report",
				direction: "inbound",
				fromContactKey: "hanna-ekstrom",
				sentAt: timestamp("2026-07-21T06:42:00.000Z"),
				body: "Hej Acme,\n\nGarageporten till boendegaraget i Kvarteret Ankaret har stannat halvöppen tre gånger sedan i går kväll. Ingen synlig skada noterades vid morgonronden, men boende riskerar att bli stående utanför.\n\nHanna Ekström, förvaltningschef\nVästerhamn Bostäder AB",
			},
			{
				key: "safe-mode",
				direction: "outbound",
				toContactKeys: ["hanna-ekstrom"],
				sentAt: timestamp("2026-07-21T07:05:00.000Z"),
				body: "Hej Hanna,\n\nTa porten ur automatisk drift, spärra rörelseområdet och hänvisa boende till den östra garageinfarten tills säkerhetskretsen är bedömd. Skicka senaste felloggens kod och be områdesvärden bekräfta om något hände under kvällen. Vi återkommer efter leverantörens första bedömning.\n\nAcme Kundcenter",
			},
			{
				key: "incident-detail",
				direction: "inbound",
				fromContactKey: "oskar-nyberg",
				ccContactKeys: ["hanna-ekstrom"],
				sentAt: timestamp("2026-07-21T07:28:00.000Z"),
				body: "Hej,\n\nEn flyttbil nuddade högra styrskenan cirka 18:10 i går. Föraren trodde inte att något skadades och jag fick ingen avvikelserapport då. Det gula sensorfästet ser snett ut i dag.\n\nOskar Nyberg, områdesvärd",
			},
			{
				key: "separate-incident",
				direction: "outbound",
				toContactKeys: ["hanna-ekstrom", "oskar-nyberg"],
				sentAt: timestamp("2026-07-21T08:10:00.000Z"),
				body: "Tack. Vi hanterar portens driftfel och påkörningen som två kopplade frågor så att felorsak, försäkring och kostnadsansvar inte blandas ihop. Porten ska fortsatt vara avstängd utan uppsikt.",
			},
			{
				key: "manual-stop",
				direction: "inbound",
				fromContactKey: "hanna-ekstrom",
				sentAt: timestamp("2026-07-22T09:14:00.000Z"),
				body: "Uppdatering: porten stannade en gång även vid övervakad manuell körning i morse. Boende är hänvisade till den östra infarten tills ni ger klartecken.",
			},
		],
	},
	{
		key: "portservice-ankaret-assessment",
		caseReference: "ACM-26071",
		subject: "Fältbedömning garageport / Kvarteret Ankaret",
		unread: true,
		messages: [
			{
				key: "remote-assessment",
				direction: "inbound",
				fromContactKey: "jonas-vik",
				sentAt: timestamp("2026-07-21T10:15:00.000Z"),
				body: "Hej,\n\nFellogg S3 och den sneda hållaren pekar på bruten säkerhetssensor. Vi kan vara på plats 15:00. Jag behöver besked om ni endast godkänner felsökning och säkerhetsåtgärd eller även permanent material.\n\nJonas Vik, Västkust Portservice AB",
			},
			{
				key: "diagnostic-only",
				direction: "outbound",
				toContactKeys: ["jonas-vik"],
				sentAt: timestamp("2026-07-21T10:30:00.000Z"),
				body: "Godkänt för felsökning och en tillfällig säker lösning inom ramavtalets jourtak. Permanent material ska offereras separat.",
			},
			{
				key: "temporary-fix",
				direction: "inbound",
				fromContactKey: "jonas-vik",
				sentAt: timestamp("2026-07-21T17:40:00.000Z"),
				body: "Porten är nu provkörd med tillfällig sensor och får köras under uppsikt. Hållaren är deformerad och permanent sensorsats behöver beställas. Offert följer separat; påkörningens kostnadsansvar är inte bedömt.",
			},
		],
	},
	{
		key: "ankaret-vehicle-incident",
		caseReference: "ACM-26072",
		subject: "Avvikelserapport 17 juli – garageporten",
		unread: false,
		messages: [
			{
				key: "incident-report",
				direction: "inbound",
				fromContactKey: "oskar-nyberg",
				ccContactKeys: ["hanna-ekstrom"],
				sentAt: timestamp("2026-07-22T11:05:00.000Z"),
				body: "Här är händelseförloppet i text: en flyttbil backade mot högra skenan 17 juli 18:10. Föraren stoppade och porten provkördes en gång utan fel. Rapporten är ännu inte signerad av flyttfirmans arbetsledare.",
			},
			{
				key: "request-signature",
				direction: "outbound",
				toContactKeys: ["oskar-nyberg", "hanna-ekstrom"],
				sentAt: timestamp("2026-07-22T11:45:00.000Z"),
				body: "Tack. Vi inväntar den signerade rapporten samt flyttfirmans försäkringsreferens. Västerhamn Bostäder behöver därefter ta ställning till beställningen av permanent material.",
			},
		],
	},
	{
		key: "vasterhamn-disputed-invoice",
		caseReference: "ACM-26073",
		subject: "Bestridande av JD-8441",
		unread: true,
		messages: [
			{
				key: "dispute",
				direction: "inbound",
				fromContactKey: "hanna-ekstrom",
				sentAt: timestamp("2026-07-24T08:55:00.000Z"),
				body: "Hej,\n\nVi bestrider jourfaktura JD-8441 på 18 900 kr. Jag godkände felsökning men inte permanent material eller förlängd jour. Oskar har inte rätt att beställa över 10 000 kr.\n\nHanna",
			},
			{
				key: "acknowledge-dispute",
				direction: "outbound",
				toContactKeys: ["hanna-ekstrom"],
				sentAt: timestamp("2026-07-24T09:25:00.000Z"),
				body: "Vi pausar intern attest och jämför beställningsunderlaget med leverantörens arbetsrapport. Inget betalningsansvar avgörs innan båda sidor är kontrollerade.",
			},
			{
				key: "approval-limit",
				direction: "inbound",
				fromContactKey: "hanna-ekstrom",
				sentAt: timestamp("2026-07-24T13:10:00.000Z"),
				body: "För tydlighet: Oskar får beställa akuta skyddsåtgärder, men inte reparation över 10 000 kr utan mig.",
			},
		],
	},
	{
		key: "portservice-invoice-basis",
		caseReference: "ACM-26073",
		subject: "Underlag JD-8441 – Kvarteret Ankaret",
		unread: false,
		messages: [
			{
				key: "supplier-position",
				direction: "inbound",
				fromContactKey: "jonas-vik",
				sentAt: timestamp("2026-07-24T14:20:00.000Z"),
				body: "Vår tekniker noterade muntligt klartecken från Oskar 16:05 att stanna kvar tills porten kunde användas. Materialraden avser tillfällig sensor, inte den permanenta satsen. Vi har ingen skriftlig beställning.",
			},
			{
				key: "request-work-log",
				direction: "outbound",
				toContactKeys: ["jonas-vik"],
				sentAt: timestamp("2026-07-24T15:00:00.000Z"),
				body: "Skicka tiderna från arbetsloggen och ramavtalsraden som ni stödjer jourpåslaget på. Vi tar inte ställning till fakturan innan underlaget är komplett.",
			},
		],
	},
	{
		key: "ankaret-tenant-indoor-temperature",
		caseReference: "ACM-26077",
		subject: "17,8 grader i lägenhet 3-1202 – Kvarteret Ankaret",
		unread: true,
		messages: [
			{
				key: "tenant-report",
				direction: "inbound",
				fromContactKey: "maja-lind",
				sentAt: timestamp("2026-08-01T06:35:00.000Z"),
				body: "Hej Acme,\n\nJag hyr lägenhet 3-1202 i Kvarteret Ankaret. Den väggmonterade inomhusgivaren märkt ANK-3-1202-VR visar 17,8 grader i vardagsrummet och min egen termometer visar 18,1. Radiatorn är kall trots att ventilen står öppet. Fönstren har varit stängda hela natten. Kan ni registrera en felanmälan?\n\nMaja Lind, hyresgäst",
			},
			{
				key: "acknowledge-and-measure",
				direction: "outbound",
				toContactKeys: ["maja-lind"],
				sentAt: timestamp("2026-08-01T07:02:00.000Z"),
				body: "Hej Maja,\n\nFelanmälan är registrerad. Låt givaren och radiatorventilen vara orörda tills vi har läst av jämförbara värden. Om du kan, svara med temperaturen i kök och sovrum samt om radiatorn är kall över hela ytan. Vi jämför detta med fastighetens driftvärden och återkommer om tillträde.\n\nAcme Kundcenter",
			},
			{
				key: "tenant-room-comparison",
				direction: "inbound",
				fromContactKey: "maja-lind",
				sentAt: timestamp("2026-08-01T07:45:00.000Z"),
				body: "Köket visar 19,4 grader och sovrummet 19,0. Radiatorn i vardagsrummet är sval upptill och helt kall nedtill. Jag är hemma efter 13 och godkänner att driftteknikern går in då.",
			},
			{
				key: "confirm-access-window",
				direction: "outbound",
				toContactKeys: ["maja-lind"],
				sentAt: timestamp("2026-08-01T10:40:00.000Z"),
				body: "Tack. Daniel från Göta Driftteknik kommer mellan 13 och 15 för att kontrollera radiatorventil, luftning och rumsgivare. Ärendet ligger kvar med förhöjd uppmärksamhet tills kontrollen är dokumenterad.",
			},
		],
	},
	{
		key: "ankaret-indoor-climate-comparison",
		caseReference: "ACM-26077",
		subject: "Temperaturkontroll trapphus 3 – Kvarteret Ankaret",
		unread: false,
		messages: [
			{
				key: "caretaker-comparison",
				direction: "inbound",
				fromContactKey: "oskar-nyberg",
				sentAt: timestamp("2026-08-01T08:35:00.000Z"),
				body: "Jag har kontrollerat trapphus 3. Givaren ANK-TR3-P2 visar 20,8 grader och inga öppna fönster syns. Fredrik i 3-1204 på samma våningsplan har godkänt att lämna ett jämförelsevärde direkt till er.",
			},
			{
				key: "neighbor-comparison",
				direction: "inbound",
				fromContactKey: "fredrik-holm",
				sentAt: timestamp("2026-08-01T09:05:00.000Z"),
				body: "Hej, jag hyr lägenhet 3-1204 mitt emot Maja. Min rumsgivare ANK-3-1204-VR visar 21,1 grader och radiatorerna är varma. Jag har inte märkt någon temperatursänkning i natt.\n\nFredrik Holm, hyresgäst",
			},
			{
				key: "central-system-check",
				direction: "inbound",
				fromContactKey: "daniel-berg",
				sentAt: timestamp("2026-08-01T10:20:00.000Z"),
				body: "Undercentralen följer inställd värmekurva och har inga aktiva larm. Trapphusgivaren och jämförelselägenheten talar mot ett generellt temperaturfall, men vi behöver kontrollera ventilen och validera givaren i 3-1202 innan lokal felorsak kan fastställas.",
			},
			{
				key: "book-local-inspection",
				direction: "outbound",
				toContactKeys: ["maja-lind", "oskar-nyberg", "daniel-berg"],
				sentAt: timestamp("2026-08-01T10:40:00.000Z"),
				body: "Kontroll i lägenhet 3-1202 är bokad mellan 13 och 15. Dokumentera både referensmätning i rummet och radiatorns funktion. Vi drar ingen slutsats om givarfel eller ventilfel före platskontrollen.",
			},
		],
	},
	{
		key: "sjoglantan-hot-water",
		caseReference: "ACM-26061",
		subject: "Varmvattnet faller under 40 grader kvällstid",
		unread: true,
		messages: [
			{
				key: "first-report",
				direction: "inbound",
				fromContactKey: "liv-andersson",
				sentAt: timestamp("2026-07-15T08:05:00.000Z"),
				body: "Hej,\n\nTre boende i Sjögläntan har mätt 38–40 grader i duschen mellan 19:30 och 21:30. På morgonen är temperaturen normal. Felanmälningarna gäller två olika trapphus.\n\nLiv Andersson, styrelseordförande",
			},
			{
				key: "request-log",
				direction: "outbound",
				toContactKeys: ["liv-andersson", "daniel-berg"],
				sentAt: timestamp("2026-07-15T09:00:00.000Z"),
				body: "Tack, serviceanmälan är registrerad. Vi jämför tappvarmvattenloggen med regulatorbytet i juni. Daniel, notera framledning, retur och varmvattenbörvärde klockan 19, 20 och 21 i kväll. Liv får en första bedömning i morgon förmiddag.",
			},
			{
				key: "caretaker-values",
				direction: "inbound",
				fromContactKey: "daniel-berg",
				sentAt: timestamp("2026-07-16T06:50:00.000Z"),
				body: "Logg från i går: börvärde 55 hela tiden, utgående varmvatten 54 kl 19, 41 kl 20 och 39 kl 21. Ventilutgången låg på 100 procent under dippen.\n\nDaniel Berg, drifttekniker\nGöta Driftteknik AB",
			},
			{
				key: "repeat-report",
				direction: "inbound",
				fromContactKey: "liv-andersson",
				sentAt: timestamp("2026-07-18T20:15:00.000Z"),
				body: "Samma problem i kväll. Två trapphus rapporterar ljummet vatten, medan temperaturen återgick efter 22.",
			},
		],
	},
	{
		key: "sjoglantan-controller-replacement",
		caseReference: "ACM-26044",
		subject: "Regulatorn startar om i undercentralen",
		unread: false,
		messages: [
			{
				key: "restart-report",
				direction: "inbound",
				fromContactKey: "daniel-berg",
				sentAt: timestamp("2026-06-25T07:30:00.000Z"),
				body: "Regulatorn har startat om två gånger sedan midnatt och tappat värmekurvan. Jag har återställt kurva 1,2 manuellt men displayen blinkar igen.",
			},
			{
				key: "planned-replacement",
				direction: "outbound",
				toContactKeys: ["daniel-berg", "liv-andersson"],
				sentAt: timestamp("2026-06-25T08:00:00.000Z"),
				body: "Efter Livs godkännande beställer vi byte av reglerkortet inom beslutad kostnadsram. Daniel dokumenterar alla börvärden före och efter. Undercentralen kan köras manuellt tills kortet anländer.",
			},
			{
				key: "verified",
				direction: "inbound",
				fromContactKey: "daniel-berg",
				sentAt: timestamp("2026-06-30T15:32:00.000Z"),
				body: "Provdriften är klar. Kurva 1,2 ligger kvar, varmvattenbörvärdet är 55 grader och inga omstarter har synts på 48 timmar.",
			},
		],
	},
	{
		key: "magasinet-hiss-tenant-report",
		caseReference: "ACM-26069",
		subject: "Hiss B öppnar om på plan 3",
		unread: true,
		messages: [
			{
				key: "tenant-report",
				direction: "inbound",
				fromContactKey: "karim-mansour",
				sentAt: timestamp("2026-07-19T12:20:00.000Z"),
				body: "Hej,\n\nHiss B stänger nästan helt på plan 3 men öppnar sedan igen. Det har hänt fyra gånger i dag. Ingen stod i dörröppningen.\n\nKarim Mansour, hyresgästrepresentant",
			},
			{
				key: "request-observation",
				direction: "outbound",
				toContactKeys: ["karim-mansour", "selma-noren"],
				sentAt: timestamp("2026-07-19T13:00:00.000Z"),
				body: "Tack, serviceanmälan är registrerad för Kvarteret Magasinet. Undvik fler egna prov. Om dörren inte går till säkert öppet läge eller någon blir instängd ska hissen tas ur drift och jouren kontaktas. Vi ber Hisspartner kontrollera plan 3.",
			},
			{
				key: "only-floor-three",
				direction: "inbound",
				fromContactKey: "karim-mansour",
				sentAt: timestamp("2026-07-20T08:10:00.000Z"),
				body: "Jag såg samma fel igen före ert svar. Det verkar bara gälla plan 3 och dörrlisten ser ren ut. Övriga plan har fungerat normalt.",
			},
		],
	},
	{
		key: "hisspartner-door-operator-quote-request-basis",
		caseReference: "ACM-26069",
		subject: "Mätunderlag inför offertförfrågan – Hiss B, Kvarteret Magasinet",
		unread: false,
		messages: [
			{
				key: "measurement",
				direction: "inbound",
				fromContactKey: "elin-rydh",
				sentAt: timestamp("2026-07-20T14:35:00.000Z"),
				body: "Vi mätte förhöjd motorström i dörrmaskinen på plan 3. Fotocell och list är utan fel. Rekommendationen är byte av dörrmaskin, inte justering.",
			},
			{
				key: "acknowledge-measurement",
				direction: "outbound",
				toContactKeys: ["elin-rydh"],
				sentAt: timestamp("2026-07-20T15:00:00.000Z"),
				body: "Tack. Vi registrerar mätningen och stämmer av omfattningen innan en formell offertförfrågan skickas. Detta mejl är varken en offertförfrågan eller en beställning.",
			},
			{
				key: "quote-request-requirements",
				direction: "inbound",
				fromContactKey: "elin-rydh",
				sentAt: timestamp("2026-07-21T15:50:00.000Z"),
				body: "För att vi ska kunna ta fram en offert behöver ni skicka en formell offertförfrågan för anläggning MAG-HISS-B och ange önskad omfattning. Begär fast pris, leveranstid, uppskattad avstängning och sista giltighetsdag. Ingen offert finns registrerad ännu och en offertförfrågan innebär inte att arbetet beställs.",
			},
		],
	},
	{
		key: "teaterkajen-false-alarm",
		caseReference: "ACM-26075",
		subject: "Brandlarm vid golvslipning i lägenhet 4-1202",
		unread: true,
		messages: [
			{
				key: "customer-report",
				direction: "inbound",
				fromContactKey: "maria-hult",
				sentAt: timestamp("2026-07-27T07:10:00.000Z"),
				body: "Hej,\n\nBrandlarmet gick 22:18 i går under golvslipning i lägenhet 4-1202. Den boende säger att det dammande arbetet var anmält tidigare i veckan. Räddningstjänsten konstaterade att ingen brand fanns.\n\nMaria Hult, styrelseordförande\nBrf Teaterkajen",
			},
			{
				key: "request-details",
				direction: "outbound",
				toContactKeys: ["maria-hult"],
				sentAt: timestamp("2026-07-27T07:50:00.000Z"),
				body: "Vi kontrollerar händelseloggen och om en tidsbegränsad frånkoppling faktiskt beställdes. Bekräfta vilken golvfirma som arbetade och vem som gjorde anmälan. Inga detektorer får kopplas från i efterhand utan en ny, uttrycklig beställning.",
			},
			{
				key: "uncertain-requester",
				direction: "inbound",
				fromContactKey: "maria-hult",
				sentAt: timestamp("2026-07-27T10:05:00.000Z"),
				body: "Den boende tror att golvfirman ringde Acmes kundcenter, men kan inte säga vem de pratade med. Arbetet började cirka 21:45 och styrelsen har ingen skriftlig bekräftelse.",
			},
		],
	},
	{
		key: "brandteknik-event-log",
		caseReference: "ACM-26075",
		subject: "Händelselogg zon 4 – Teaterkajen",
		unread: false,
		messages: [
			{
				key: "event-log",
				direction: "inbound",
				fromContactKey: "per-rahm",
				sentAt: timestamp("2026-07-27T13:20:00.000Z"),
				body: "Centralen registrerade rökdetektor zon 4 klockan 22:18:34. Vi hittar ingen beställning om frånkoppling i jourloggen. Zon 4 täcker plan 4 och lägenhetens hall ligger närmast utlöst detektor.",
			},
			{
				key: "request-call-search",
				direction: "outbound",
				toContactKeys: ["per-rahm"],
				sentAt: timestamp("2026-07-27T14:00:00.000Z"),
				body: "Sök även på inkommande samtal från Brf Teaterkajen och golvfirman mellan 20 och 22. Återkom med resultat innan vi lämnar styrelsen underlag om ansvar eller extra jourkostnad.",
			},
		],
	},
	{
		key: "magasinet-ta2-filter",
		caseReference: "ACM-26038",
		subject: "Genomfört planerat filterbyte – TA2 Magasinet",
		unread: false,
		messages: [
			{
				key: "completion",
				direction: "inbound",
				fromContactKey: "daniel-berg",
				ccContactKeys: ["selma-noren"],
				sentAt: timestamp("2026-06-18T15:05:00.000Z"),
				body: "Det planerade filterbytet på TA2 i Kvarteret Magasinet är klart. Displayen visar 82 Pa efter återstart, inga larm ligger kvar och båda fläktarna är kontrollerade. Arbetsrapporten kan föras in som utförd åtgärd i 2026 års underhållsuppföljning.\n\nDaniel Berg, Göta Driftteknik AB",
			},
			{
				key: "owner-acceptance",
				direction: "inbound",
				fromContactKey: "selma-noren",
				ccContactKeys: ["daniel-berg"],
				sentAt: timestamp("2026-06-18T15:18:00.000Z"),
				body: "Tack. Västerhamn Bostäder godkänner utfallet och vill att Acme markerar åtgärden som genomförd i underhållsuppföljningen. Inga nya driftlarm syns i vår kontroll.\n\nSelma Norén, fastighetsansvarig\nVästerhamn Bostäder AB",
			},
		],
	},
	{
		key: "sjoglantan-basement-moisture",
		caseReference: null,
		subject: "Ny fuktfläck vid rörschaktet i Sjögläntans källare",
		unread: true,
		messages: [
			{
				key: "first-observation",
				direction: "inbound",
				fromContactKey: "liv-andersson",
				ccContactKeys: ["daniel-berg"],
				sentAt: timestamp("2026-07-30T09:10:00.000Z"),
				body: "Hej,\n\nDaniel såg i morse en ny fuktfläck i källartaket vid rörschaktet intill Sjögläntans undercentral. Det droppar inte och golvet är torrt, men området är avspärrat. Vi vet inte om det har samband med varmvattenproblemet. Registrera detta som en separat skadeobservation tills orsaken är utredd.\n\nLiv Andersson, styrelseordförande",
			},
			{
				key: "marked-growth",
				direction: "inbound",
				fromContactKey: "liv-andersson",
				ccContactKeys: ["daniel-berg"],
				sentAt: timestamp("2026-07-30T11:20:00.000Z"),
				body: "Uppdatering: Daniel markerade fläckens kant och den har vuxit ungefär tre centimeter på två timmar. Fortfarande inget synligt dropp och ingen fastställd källa.",
			},
		],
	},
	{
		key: "brandteknik-insurance-certificate",
		caseReference: null,
		subject: "Förnyat ansvarsförsäkringscertifikat",
		unread: true,
		messages: [
			{
				key: "certificate",
				direction: "inbound",
				fromContactKey: "per-rahm",
				sentAt: timestamp("2026-07-31T08:30:00.000Z"),
				body: "För kännedom är Brandteknik Västs ansvarsförsäkring förnyad till 31 juli 2027. Certifikatnummer IF-AV-882104. Detta gäller leverantörsregistret och avser inget pågående serviceärende.",
			},
		],
	},
	{
		key: "ankaret-garageport-limited-operation",
		caseReference: null,
		subject: "Garageporten fungerade i morgonens test",
		unread: true,
		messages: [
			{
				key: "limited-test",
				direction: "inbound",
				fromContactKey: "hanna-ekstrom",
				sentAt: timestamp("2026-08-01T07:25:00.000Z"),
				body: "Garageporten i Kvarteret Ankaret gick fem tomma cykler utan stopp i morse, men vi har inte provat under normal morgontrafik. Den permanenta sensorsatsen är fortfarande inte beslutad. Ska vi låta huvudärendet vara öppet?",
			},
			{
				key: "keep-open",
				direction: "outbound",
				toContactKeys: ["hanna-ekstrom"],
				sentAt: timestamp("2026-08-01T08:00:00.000Z"),
				body: "Ja, betrakta inte fem tomma cykler som slutligt klartecken. Den här tråden behöver kopplas till befintligt portärende efter verifiering, inte bli ett nytt felärende.",
			},
		],
	},
] as const satisfies readonly AcmeEmailThreadSeed[];

export const ACME_BUSINESS_STORY =
	"Acme AB är extern teknisk bostadsförvaltare i Göteborg. På uppdrag av Västerhamn Bostäder och två bostadsrättsföreningars styrelser följer Acme fyra fastigheter, tar emot serviceanmälningar direkt från både kunder och boende, samordnar specialistleverantörer, dokumenterar genomfört underhåll och lämnar tydliga beslutsunderlag utan att fatta kundens ekonomiska eller säkerhetskritiska beslut.";

export const ACME_REPLACEABLE_TABLES = [
	"emailIntegrationWebhookCleanupTasks",
	"emailIntegrations",
	"connectedAccounts",
	"emailInboxes",
	"emailThreads",
	"emailThreadExternalReferences",
	"contacts",
	"entityTypes",
	"entityFieldDefinitions",
	"entities",
	"entityTextFieldValues",
	"entityNumberFieldValues",
	"entityBooleanFieldValues",
	"entityDateFieldValues",
	"cases",
	"agentTasks",
	"agentTurns",
	"agentRuns",
	"agentItems",
	"caseEmbeddings",
	"globalSearchEntries",
	"caseEvents",
	"caseContactRelations",
	"caseEntityRelations",
	"caseCaseRelations",
	"caseEmailThreadRelations",
	"emailMessages",
	"emailDrafts",
	"emailSends",
	"emailIngestEvents",
	"emailIngestRecipients",
] as const;

export type AcmeReplaceableTable = (typeof ACME_REPLACEABLE_TABLES)[number];
export type AcmeReplacementCounts = Record<AcmeReplaceableTable, number>;

export function createEmptyAcmeReplacementCounts(): AcmeReplacementCounts {
	return Object.fromEntries(
		ACME_REPLACEABLE_TABLES.map((table) => [table, 0]),
	) as AcmeReplacementCounts;
}

export function calculateAcmeCreationCounts(): AcmeReplacementCounts {
	const counts = createEmptyAcmeReplacementCounts();
	counts.emailIntegrations = 1;
	counts.connectedAccounts = 1;
	counts.emailInboxes = 1;
	counts.emailThreads = ACME_EMAIL_THREADS.length;
	counts.emailThreadExternalReferences = ACME_EMAIL_THREADS.length;
	counts.contacts = ACME_CONTACTS.length;
	counts.entityTypes = ACME_ENTITY_TYPES.length;
	counts.entityFieldDefinitions = ACME_ENTITY_TYPES.reduce(
		(total, entityType) => total + entityType.fields.length,
		0,
	);
	counts.entities = ACME_ENTITIES.length;
	for (const entity of ACME_ENTITIES) {
		for (const value of entity.values) {
			counts[
				value.kind === "text"
					? "entityTextFieldValues"
					: value.kind === "number"
						? "entityNumberFieldValues"
						: value.kind === "boolean"
							? "entityBooleanFieldValues"
							: "entityDateFieldValues"
			] += 1;
		}
	}
	counts.cases = ACME_CASES.length;
	counts.globalSearchEntries =
		ACME_CONTACTS.length + ACME_ENTITIES.length + ACME_CASES.length;
	counts.caseEvents =
		ACME_CASES.length +
		ACME_CASES.reduce((total, caseSeed) => total + caseSeed.history.length, 0) +
		ACME_EMAIL_THREADS.filter((thread) => thread.caseReference !== null).reduce(
			(total, thread) => total + thread.messages.length,
			0,
		);
	counts.caseContactRelations = ACME_CASES.reduce(
		(total, caseSeed) => total + caseSeed.contactKeys.length,
		0,
	);
	counts.caseEntityRelations = ACME_CASES.reduce(
		(total, caseSeed) => total + caseSeed.entityKeys.length,
		0,
	);
	counts.caseCaseRelations = ACME_CASE_RELATIONS.length;
	counts.caseEmailThreadRelations = ACME_EMAIL_THREADS.filter(
		(thread) => thread.caseReference !== null,
	).length;
	counts.emailMessages = ACME_EMAIL_THREADS.reduce(
		(total, thread) => total + thread.messages.length,
		0,
	);
	counts.emailSends = ACME_EMAIL_THREADS.reduce(
		(total, thread) =>
			total +
			thread.messages.filter((message) => message.direction === "outbound")
				.length,
		0,
	);
	return counts;
}

function hashAcmeDatasetPayload(payload: string) {
	let hash = 0x811c9dc5;
	for (let index = 0; index < payload.length; index += 1) {
		hash ^= payload.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

export function calculateAcmeDatasetFingerprint() {
	return hashAcmeDatasetPayload(
		JSON.stringify({
			version: ACME_DATASET_VERSION,
			inbox: ACME_INBOX,
			contacts: ACME_CONTACTS,
			entityTypes: ACME_ENTITY_TYPES,
			entities: ACME_ENTITIES,
			cases: ACME_CASES,
			caseRelations: ACME_CASE_RELATIONS,
			emailThreads: ACME_EMAIL_THREADS,
			businessStory: ACME_BUSINESS_STORY,
		}),
	);
}

function requireUniqueSeedKeys(label: string, keys: readonly string[]) {
	if (new Set(keys).size !== keys.length) {
		throw new Error(`Acme seed has duplicate ${label} keys`);
	}
}

export function assertAcmeDatasetIsInternallyConsistent() {
	requireUniqueSeedKeys(
		"contact",
		ACME_CONTACTS.map((contact) => contact.key),
	);
	requireUniqueSeedKeys(
		"contact address",
		ACME_CONTACTS.map((contact) => contact.address.toLocaleLowerCase()),
	);
	requireUniqueSeedKeys(
		"entity type",
		ACME_ENTITY_TYPES.map((entityType) => entityType.key),
	);
	requireUniqueSeedKeys(
		"entity",
		ACME_ENTITIES.map((entity) => entity.key),
	);
	requireUniqueSeedKeys(
		"case reference",
		ACME_CASES.map((caseSeed) => caseSeed.reference),
	);
	requireUniqueSeedKeys(
		"email thread",
		ACME_EMAIL_THREADS.map((thread) => thread.key),
	);

	const contactKeys = new Set<string>(
		ACME_CONTACTS.map((contact) => contact.key),
	);
	const entityTypeByKey = new Map(
		ACME_ENTITY_TYPES.map((entityType) => [entityType.key, entityType]),
	);
	const entityByKey = new Map(
		ACME_ENTITIES.map((entity) => [entity.key, entity]),
	);
	const entityKeys = new Set(entityByKey.keys());
	const caseReferences = new Set<string>(
		ACME_CASES.map((caseSeed) => caseSeed.reference),
	);

	for (const entityType of ACME_ENTITY_TYPES) {
		requireUniqueSeedKeys(
			`${entityType.key} field`,
			entityType.fields.map((field) => field.key),
		);
	}
	for (const entity of ACME_ENTITIES) {
		const entityType = entityTypeByKey.get(entity.entityTypeKey);
		if (!entityType) {
			throw new Error(`Entity ${entity.key} has an unknown entity type`);
		}
		const fieldByKey = new Map(
			entityType.fields.map((field) => [field.key, field]),
		);
		requireUniqueSeedKeys(
			`${entity.key} value`,
			entity.values.map((value) => value.fieldKey),
		);
		for (const value of entity.values) {
			const field = fieldByKey.get(value.fieldKey);
			if (!field || field.valueType !== value.kind) {
				throw new Error(
					`Entity ${entity.key} has an invalid ${value.fieldKey} value`,
				);
			}
		}
		for (const field of entityType.fields) {
			if (
				field.required &&
				!entity.values.some((value) => value.fieldKey === field.key)
			) {
				throw new Error(`Entity ${entity.key} is missing ${field.key}`);
			}
		}
		if (
			entity.entityTypeKey === "fastighet" &&
			!entity.values.some(
				(value) =>
					value.fieldKey === "housingForm" &&
					value.kind === "text" &&
					(value.value === "Hyresrätt" || value.value === "Bostadsrätt"),
			)
		) {
			throw new Error(`Property ${entity.key} has an invalid housing form`);
		}
	}

	const ownerKeysByProperty = new Map<string, Set<string>>();
	for (const caseSeed of ACME_CASES) {
		for (const contactKey of caseSeed.contactKeys) {
			if (!contactKeys.has(contactKey)) {
				throw new Error(`Case ${caseSeed.reference} has an unknown contact`);
			}
		}
		for (const entityKey of caseSeed.entityKeys) {
			if (!entityKeys.has(entityKey)) {
				throw new Error(`Case ${caseSeed.reference} has an unknown entity`);
			}
		}
		const relatedEntities = caseSeed.entityKeys.map((entityKey) => {
			const entity = entityByKey.get(entityKey);
			if (!entity) throw new Error("Unreachable missing Acme entity");
			return entity;
		});
		for (const requiredTypeKey of [
			"fastighetsagare",
			"fastighet",
			"leverantor",
		]) {
			if (
				relatedEntities.filter(
					(entity) => entity.entityTypeKey === requiredTypeKey,
				).length !== 1
			) {
				throw new Error(
					`Case ${caseSeed.reference} must have exactly one ${requiredTypeKey}`,
				);
			}
		}
		const property = relatedEntities.find(
			(entity) => entity.entityTypeKey === "fastighet",
		);
		const owner = relatedEntities.find(
			(entity) => entity.entityTypeKey === "fastighetsagare",
		);
		if (!property || !owner) throw new Error("Unreachable Acme case relation");
		const propertyOwnerKeys =
			ownerKeysByProperty.get(property.key) ?? new Set();
		propertyOwnerKeys.add(owner.key);
		ownerKeysByProperty.set(property.key, propertyOwnerKeys);
		let previousHistoryAt = caseSeed.createdAt - 1;
		for (const event of caseSeed.history) {
			if (event.occurredAt < caseSeed.createdAt) {
				throw new Error(
					`Case ${caseSeed.reference} has history before creation`,
				);
			}
			if (event.occurredAt <= previousHistoryAt) {
				throw new Error(
					`Case ${caseSeed.reference} history is not chronological`,
				);
			}
			previousHistoryAt = event.occurredAt;
		}
	}
	for (const property of ACME_ENTITIES.filter(
		(entity) => entity.entityTypeKey === "fastighet",
	)) {
		const ownerKeys = ownerKeysByProperty.get(property.key);
		if (!ownerKeys || ownerKeys.size !== 1) {
			throw new Error(
				`Property ${property.key} must be used by cases for exactly one owner`,
			);
		}
	}
	for (const [firstReference, secondReference] of ACME_CASE_RELATIONS) {
		if (
			(firstReference as string) === (secondReference as string) ||
			!caseReferences.has(firstReference) ||
			!caseReferences.has(secondReference)
		) {
			throw new Error("Acme seed has an invalid case relation");
		}
	}

	for (const thread of ACME_EMAIL_THREADS as readonly AcmeEmailThreadSeed[]) {
		if (thread.caseReference && !caseReferences.has(thread.caseReference)) {
			throw new Error(`Thread ${thread.key} has an unknown case`);
		}
		requireUniqueSeedKeys(
			`${thread.key} message`,
			thread.messages.map((message) => message.key),
		);
		let previousSentAt = Number.NEGATIVE_INFINITY;
		for (const message of thread.messages) {
			if (message.sentAt <= previousSentAt) {
				throw new Error(`Thread ${thread.key} is not chronological`);
			}
			previousSentAt = message.sentAt;
			const participantKeys = [
				...(message.direction === "inbound"
					? [message.fromContactKey]
					: message.toContactKeys),
				...(message.ccContactKeys ?? []),
			];
			if (participantKeys.some((key) => !contactKeys.has(key))) {
				throw new Error(`Thread ${thread.key} has an unknown participant`);
			}
		}
	}

	for (const contact of ACME_CONTACTS) {
		const inboundMessages = ACME_EMAIL_THREADS.flatMap((thread) =>
			thread.messages.filter(
				(message) =>
					message.direction === "inbound" &&
					message.fromContactKey === contact.key,
			),
		);
		if (inboundMessages.length === 0) {
			throw new Error(`Contact ${contact.key} has no inbound email activity`);
		}
	}

	return calculateAcmeCreationCounts();
}

export function getAcmeContactActivity(contactKey: string) {
	const receivedAt = ACME_EMAIL_THREADS.flatMap((thread) =>
		thread.messages.flatMap((message) =>
			message.direction === "inbound" && message.fromContactKey === contactKey
				? [message.sentAt]
				: [],
		),
	);
	if (receivedAt.length === 0) {
		throw new Error(`Contact ${contactKey} has no inbound email activity`);
	}
	return {
		firstSeenAt: Math.min(...receivedAt),
		lastSeenAt: Math.max(...receivedAt),
	};
}

export function getAcmeCaseActivity(reference: string) {
	const caseSeed = ACME_CASES.find(
		(candidate) => candidate.reference === reference,
	);
	if (!caseSeed) {
		throw new Error(`Unknown Acme seed case ${reference}`);
	}
	const activityTimes = [
		caseSeed.createdAt,
		...caseSeed.history.map((event) => event.occurredAt),
		...ACME_EMAIL_THREADS.flatMap((thread) =>
			thread.caseReference === reference
				? thread.messages.map((message) => message.sentAt)
				: [],
		),
	];
	return Math.max(...activityTimes);
}
