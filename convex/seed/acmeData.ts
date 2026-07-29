export type SeedEmailMessage = {
	direction: "inbound" | "outbound";
	body: string;
	hoursAfterStart: number;
};

export type AcmeCaseSeed = {
	reference: string;
	title: string;
	description: string;
	initialNote: string;
	status: "open" | "closed";
	daysAgo: number;
	dueInDays: number | null;
	unread: boolean;
	contact: {
		name: string;
		address: string;
	};
	subject: string;
	messages: SeedEmailMessage[];
};

export const ACME_INBOX = {
	displayName: "Acme AB — seeddata",
	address: "kundservice@seed.acme.invalid",
} as const;

export const ACME_CASES: AcmeCaseSeed[] = [
	{
		reference: "SEED-FV-001",
		title: "Kall lägenhet efter centralservice",
		description:
			"Kunden upplever 17–18 °C i hela lägenheten efter den senaste servicen av fastighetens fjärrvärmecentral.",
		initialNote:
			"Kontrollera serviceprotokollet och be drifttekniker verifiera värmekurvan.",
		status: "open",
		daysAgo: 1,
		dueInDays: 1,
		unread: true,
		contact: {
			name: "Karin Lind",
			address: "karin.lind@seed-kund.invalid",
		},
		subject: "Fortfarande kallt efter service",
		messages: [
			{
				direction: "inbound",
				hoursAfterStart: 0,
				body: "Hej,\n\nSedan ni servade centralen i måndags har vi bara 17–18 grader hemma. Alla element är ljumma trots att termostaterna står fullt öppna. Kan ni kontrollera om något blev fel?\n\nVänliga hälsningar\nKarin",
			},
			{
				direction: "outbound",
				hoursAfterStart: 2,
				body: "Hej Karin,\n\nTack för tydlig information. Vi har bett driftgruppen kontrollera värmekurvan och serviceprotokollet. Vi återkommer senast i morgon förmiddag.\n\nVänliga hälsningar\nAcme AB",
			},
			{
				direction: "inbound",
				hoursAfterStart: 18,
				body: "Tack. I morse var det 17,2 grader i sovrummet. Jag bifogar gärna temperaturbilder om det behövs.",
			},
		],
	},
	{
		reference: "SEED-FV-002",
		title: "Ojämn värme mellan radiatorer",
		description:
			"Två radiatorer blir heta medan resterande radiatorer i radhuset förblir kalla.",
		initialNote:
			"Ta reda på om problemet ligger före eller efter kundens avlämningspunkt.",
		status: "open",
		daysAgo: 2,
		dueInDays: 2,
		unread: false,
		contact: {
			name: "Johan Berg",
			address: "johan.berg@seed-kund.invalid",
		},
		subject: "Vissa element kalla på Tallstigen 8",
		messages: [
			{
				direction: "inbound",
				hoursAfterStart: 0,
				body: "Hej! Två element på bottenvåningen är riktigt varma men alla andra är kalla. Trycket på vår central ser normalt ut. Är detta något ni kan felsöka på distans?",
			},
			{
				direction: "outbound",
				hoursAfterStart: 3,
				body: "Hej Johan,\n\nDet låter i första hand som ett lokalt cirkulationsproblem efter avlämningspunkten. Vi kontrollerar ändå leveransvärdena och återkommer med besked innan ni bokar VVS-tekniker.",
			},
		],
	},
	{
		reference: "SEED-FV-003",
		title: "Faktura avser tidigare anläggning",
		description:
			"En slutfaktura innehåller energiförbrukning från tiden efter att kunden flyttade.",
		initialNote:
			"Jämför avläst mätarställning på flyttdagen med fakturans slutdatum.",
		status: "open",
		daysAgo: 3,
		dueInDays: 4,
		unread: true,
		contact: {
			name: "Elin Sjöberg",
			address: "elin.sjoberg@seed-kund.invalid",
		},
		subject: "Fel period på slutfaktura 78421",
		messages: [
			{
				direction: "inbound",
				hoursAfterStart: 0,
				body: "Hej,\n\nJag flyttade från Sjögränd 14 den 30 juni men faktura 78421 verkar innehålla förbrukning till och med 12 juli. Kan ni rätta perioden innan förfallodatum?\n\nMvh Elin",
			},
		],
	},
	{
		reference: "SEED-FV-004",
		title: "Ägarbyte för villaanslutning",
		description:
			"Ny fastighetsägare vill flytta abonnemanget och få bekräftelse på startdatum.",
		initialNote:
			"Ägarbytesblanketten är mottagen och fastighetsbeteckningen är verifierad.",
		status: "closed",
		daysAgo: 5,
		dueInDays: null,
		unread: false,
		contact: {
			name: "Markus Holm",
			address: "markus.holm@seed-kund.invalid",
		},
		subject: "Ägarbyte för Sundhamn Eken 4",
		messages: [
			{
				direction: "inbound",
				hoursAfterStart: 0,
				body: "Hej, jag tar över fastigheten Sundhamn Eken 4 den 1 augusti. Den signerade ägarbytesblanketten ligger med i detta mejl. Bekräfta gärna att abonnemanget börjar samma dag.",
			},
			{
				direction: "outbound",
				hoursAfterStart: 7,
				body: "Hej Markus,\n\nÄgarbytet är nu registrerat med startdatum 1 augusti. En skriftlig bekräftelse kommer även med nästa avtalsutskick.\n\nVälkommen som kund!",
			},
		],
	},
	{
		reference: "SEED-FV-005",
		title: "Varmvattnet tar slut på kvällarna",
		description:
			"En bostadsrättsförening får återkommande klagomål på låg varmvattentemperatur efter klockan 20.",
		initialNote:
			"Begär timvärden för tappvarmvatten och kontrollera reglercentralens prioritering.",
		status: "open",
		daysAgo: 6,
		dueInDays: 1,
		unread: true,
		contact: {
			name: "Lina Vik",
			address: "lina.vik@seed-brf.invalid",
		},
		subject: "Låg varmvattentemperatur i Brf Ankaret",
		messages: [
			{
				direction: "inbound",
				hoursAfterStart: 0,
				body: "Hej kundservice,\n\nBoende i tre uppgångar rapporterar att varmvattnet blir ljummet runt kl. 20–22. På morgonen fungerar det normalt. Kan ni se något avvikande i våra värden?\n\nLina Vik, Brf Ankaret",
			},
			{
				direction: "outbound",
				hoursAfterStart: 4,
				body: "Hej Lina,\n\nVi ser en tydlig effekttopp under den perioden och har skickat timvärdena till vår drifttekniker. Nästa steg är att kontrollera varmvattenprioriteringen i er reglercentral.",
			},
			{
				direction: "inbound",
				hoursAfterStart: 25,
				body: "Bra, tack. Problemet återkom även i går kväll. Portkoden för teknikrummet finns hos vår fastighetsskötare.",
			},
		],
	},
	{
		reference: "SEED-FV-006",
		title: "Susande ljud från fjärrvärmecentral",
		description:
			"Ett kraftigt susande ljud uppstår i centralen när utomhustemperaturen sjunker.",
		initialNote:
			"Kontrollera differenstryck och om reglerventilen arbetar nära ändläge.",
		status: "open",
		daysAgo: 8,
		dueInDays: 3,
		unread: false,
		contact: {
			name: "Anders Ek",
			address: "anders.ek@seed-kund.invalid",
		},
		subject: "Högt ljud i fjärrvärmecentralen",
		messages: [
			{
				direction: "inbound",
				hoursAfterStart: 0,
				body: "Hej, centralen har börjat låta som ett konstant sus när det blir kallare ute. Värmen fungerar, men ljudet hörs upp i hallen. Behöver ventilen justeras?",
			},
			{
				direction: "outbound",
				hoursAfterStart: 5,
				body: "Hej Anders,\n\nVi har kontrollerat nätets differenstryck och bokar ett platsbesök för att mäta över reglerventilen. Anläggningen kan vara i drift tills dess.",
			},
		],
	},
	{
		reference: "SEED-FV-007",
		title: "Underlag för styrelsens energirapport",
		description:
			"Brf Ankaret önskar normalårskorrigerad förbrukning och effekttoppar för de senaste tre åren.",
		initialNote:
			"Sammanställ årsdata och säkerställ att fullmakten för styrelsens kontaktperson är aktuell.",
		status: "closed",
		daysAgo: 10,
		dueInDays: null,
		unread: false,
		contact: {
			name: "Lina Vik",
			address: "lina.vik@seed-brf.invalid",
		},
		subject: "Energistatistik inför årsstämman",
		messages: [
			{
				direction: "inbound",
				hoursAfterStart: 0,
				body: "Hej igen,\n\nInför årsstämman behöver styrelsen normalårskorrigerad fjärrvärmeförbrukning samt högsta dygnseffekt för 2023–2025. Kan ni hjälpa oss med ett underlag?",
			},
			{
				direction: "outbound",
				hoursAfterStart: 20,
				body: "Hej Lina,\n\nRapporten är framtagen och skickad till styrelsens registrerade dokumentbrevlåda. Den innehåller både normalårskorrigerad energi och effekttoppar per månad.",
			},
		],
	},
	{
		reference: "SEED-FV-008",
		title: "Information om planerat avbrott saknas",
		description:
			"En förvaltare har inte fått avisering om nästa veckas planerade avbrott.",
		initialNote:
			"Kontrollera kontaktlistan för fastighetsbolagets tre berörda adresser.",
		status: "open",
		daysAgo: 11,
		dueInDays: 1,
		unread: true,
		contact: {
			name: "Oskar Dahl",
			address: "oskar.dahl@seed-forvaltning.invalid",
		},
		subject: "Avisering inför avbrottet på Hamngatan",
		messages: [
			{
				direction: "inbound",
				hoursAfterStart: 0,
				body: "Hej,\n\nVi hörde via en hyresgäst att fjärrvärmen stängs av på Hamngatan nästa tisdag, men vi som förvaltare har inte fått någon avisering. Vilka tider gäller och vilka fastigheter berörs?\n\nOskar, Kuststad Förvaltning",
			},
		],
	},
	{
		reference: "SEED-FV-009",
		title: "Mätvärde avviker i kundportalen",
		description:
			"Portalens dygnsvärde är ungefär tio gånger högre än fastighetens normala förbrukning.",
		initialNote:
			"Flagga mätvärdet för kvalitetskontroll innan nästa fakturakörning.",
		status: "open",
		daysAgo: 13,
		dueInDays: 2,
		unread: false,
		contact: {
			name: "Maja Lund",
			address: "maja.lund@seed-kund.invalid",
		},
		subject: "Orimligt mätvärde den 14 juli",
		messages: [
			{
				direction: "inbound",
				hoursAfterStart: 0,
				body: "Hej! I portalen står det att vi använde 1 842 kWh den 14 juli. Vanligtvis ligger vi under 200 kWh per dygn på sommaren. Kan det vara ett avläsningsfel?",
			},
			{
				direction: "outbound",
				hoursAfterStart: 6,
				body: "Hej Maja,\n\nDu har rätt i att värdet avviker tydligt. Vi har stoppat det från fakturaunderlaget och beställt en kontrollavläsning. Du behöver inte göra något under tiden.",
			},
		],
	},
	{
		reference: "SEED-FV-010",
		title: "Offert för anslutning av nytt garage",
		description:
			"En befintlig villakund vill ansluta ett fristående garage till husets värmesystem.",
		initialNote:
			"Teknisk rådgivning behövs innan besked om befintlig servis har tillräcklig kapacitet.",
		status: "open",
		daysAgo: 15,
		dueInDays: 5,
		unread: true,
		contact: {
			name: "Viktor Hall",
			address: "viktor.hall@seed-kund.invalid",
		},
		subject: "Kan garaget anslutas till fjärrvärmen?",
		messages: [
			{
				direction: "inbound",
				hoursAfterStart: 0,
				body: "Hej,\n\nVi bygger ett isolerat garage på 55 kvadrat och funderar på vattenburen golvvärme från husets central. Behöver vi en större servis eller kan ni lämna offert på en sådan utökning?",
			},
		],
	},
	{
		reference: "SEED-FV-011",
		title: "Återkommande tryckfall i sekundärsystem",
		description:
			"Fastighetsskötaren behöver fylla på sekundärsystemet varje vecka trots att inget synligt läckage finns.",
		initialNote:
			"Avgränsa om felet sitter i expansionskärl, säkerhetsventil eller intern läcka.",
		status: "open",
		daysAgo: 17,
		dueInDays: 2,
		unread: false,
		contact: {
			name: "Nina Blom",
			address: "nina.blom@seed-forvaltning.invalid",
		},
		subject: "Trycket sjunker varje vecka i Kv. Seglet",
		messages: [
			{
				direction: "inbound",
				hoursAfterStart: 0,
				body: "Hej,\n\nSekundärtrycket i Kv. Seglet sjunker från 1,4 till 0,7 bar på ungefär en vecka. Vi ser inget vatten vid centralen. Kan ni hjälpa oss avgöra om expansionskärlet är boven?\n\nNina",
			},
			{
				direction: "outbound",
				hoursAfterStart: 9,
				body: "Hej Nina,\n\nVi börjar med att kontrollera säkerhetsventilens spillrör och expansionskärlets förtryck vid nästa besök. Fortsätt gärna notera trycket dagligen fram till dess.",
			},
		],
	},
	{
		reference: "SEED-FV-012",
		title: "Dubbel betalning efter autogiro",
		description:
			"Kunden betalade manuellt samtidigt som autogirot drogs och vill få överskottet återbetalat.",
		initialNote:
			"Ekonomi har bekräftat dubbla inbetalningar med samma OCR-nummer.",
		status: "closed",
		daysAgo: 20,
		dueInDays: null,
		unread: false,
		contact: {
			name: "Erik Strand",
			address: "erik.strand@seed-kund.invalid",
		},
		subject: "Samma faktura betald två gånger",
		messages: [
			{
				direction: "inbound",
				hoursAfterStart: 0,
				body: "Hej, jag betalade fakturan i internetbanken men såg sedan att autogirot också drogs. Båda betalningarna syns på kontot. Hur får jag tillbaka den ena?",
			},
			{
				direction: "outbound",
				hoursAfterStart: 28,
				body: "Hej Erik,\n\nVi har hittat båda betalningarna och registrerat återbetalning av överskottet. Pengarna bör finnas på ditt konto inom tre bankdagar.",
			},
		],
	},
	{
		reference: "SEED-FV-013",
		title: "Temperaturgivare visar offline",
		description:
			"Fastighetsbolagets framledningsgivare har slutat rapportera till energiuppföljningen.",
		initialNote:
			"Kontrollera senaste telemetri och batteristatus innan tekniker skickas ut.",
		status: "open",
		daysAgo: 22,
		dueInDays: 3,
		unread: true,
		contact: {
			name: "Oskar Dahl",
			address: "oskar.dahl@seed-forvaltning.invalid",
		},
		subject: "Givare T1 offline sedan i fredags",
		messages: [
			{
				direction: "inbound",
				hoursAfterStart: 0,
				body: "Hej support,\n\nI energiuppföljningen står framledningsgivare T1 som offline sedan fredag 16:42. Övriga givare rapporterar normalt. Kan ni starta om kommunikationen på distans?",
			},
			{
				direction: "outbound",
				hoursAfterStart: 2,
				body: "Hej Oskar,\n\nOmstarten nådde gatewayen men inte själva givaren. Vi lägger med ett givarbatteri till teknikerns nästa planerade besök.",
			},
			{
				direction: "inbound",
				hoursAfterStart: 30,
				body: "Tack. Givaren är fortfarande offline i dag, så ett besök behövs.",
			},
		],
	},
	{
		reference: "SEED-FV-014",
		title: "För hög returtemperatur",
		description:
			"Fastigheten har fått återkommande varning om hög returtemperatur och risk för avgift.",
		initialNote:
			"Analysera avkylningen mot utomhustemperatur och boka energiuppföljning.",
		status: "open",
		daysAgo: 25,
		dueInDays: 7,
		unread: false,
		contact: {
			name: "Thomas Alm",
			address: "thomas.alm@seed-brf.invalid",
		},
		subject: "Hjälp att sänka returtemperaturen",
		messages: [
			{
				direction: "inbound",
				hoursAfterStart: 0,
				body: "Hej,\n\nVår månadsrapport varnar åter för hög returtemperatur, nu 49 grader i snitt. Vi har luftat radiatorerna men ser ingen skillnad. Kan ni hjälpa styrelsen tolka kurvorna?",
			},
			{
				direction: "outbound",
				hoursAfterStart: 22,
				body: "Hej Thomas,\n\nVi ser att avkylningen försämras främst vid låg last. En energiingenjör går igenom ventiler och styrkurva med er på det bokade uppföljningsmötet.",
			},
		],
	},
	{
		reference: "SEED-FV-015",
		title: "Uppföljning efter energioptimering",
		description:
			"Kunden vill jämföra utfallet efter vårens injustering med motsvarande period föregående år.",
		initialNote:
			"Ta fram normalårskorrigerad jämförelse och separera varmvatten från uppvärmning.",
		status: "closed",
		daysAgo: 30,
		dueInDays: null,
		unread: false,
		contact: {
			name: "Sofia Nyberg",
			address: "sofia.nyberg@seed-forvaltning.invalid",
		},
		subject: "Resultat från optimeringen på Kajhuset",
		messages: [
			{
				direction: "inbound",
				hoursAfterStart: 0,
				body: "Hej,\n\nNu har injusteringen varit aktiv i tre månader. Kan ni jämföra energianvändningen med samma period förra året och säga om besparingen ligger i nivå med prognosen?\n\nSofia",
			},
			{
				direction: "outbound",
				hoursAfterStart: 46,
				body: "Hej Sofia,\n\nDen normalårskorrigerade användningen har minskat med 11,8 procent. Prognosen var 10–12 procent, så utfallet ligger helt i linje med målet. Rapporten är arkiverad på ärendet.",
			},
		],
	},
];
