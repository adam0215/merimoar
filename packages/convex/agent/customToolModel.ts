import { ConvexError, type Infer, v } from "convex/values";

export const CUSTOM_TOOL_LIMITS = {
	integrationName: 80,
	baseUrl: 2_048,
	toolName: 80,
	toolDescription: 2_000,
	path: 1_024,
	parameterCount: 20,
	parameterDescription: 500,
} as const;

export const customToolParameterTypeValidator = v.union(
	v.literal("string"),
	v.literal("number"),
	v.literal("boolean"),
);

export const customToolParameterValidator = v.object({
	name: v.string(),
	type: customToolParameterTypeValidator,
	description: v.string(),
	required: v.boolean(),
});

export type CustomToolParameter = Infer<typeof customToolParameterValidator>;

export const customToolFieldsValidator = v.object({
	name: v.string(),
	description: v.string(),
	path: v.string(),
	parameters: v.array(customToolParameterValidator),
	requiresApproval: v.boolean(),
});

export type CustomToolFields = Infer<typeof customToolFieldsValidator>;

export const customToolRuntimeDefinitionValidator = v.object({
	toolId: v.id("agentCustomTools"),
	name: v.string(),
	normalizedName: v.string(),
	description: v.string(),
	parameters: v.array(customToolParameterValidator),
	requiresApproval: v.boolean(),
	baseUrl: v.string(),
	path: v.string(),
});

export const customToolRunSnapshotValidator =
	customToolRuntimeDefinitionValidator.omit("name").extend({
		configurationHash: v.string(),
	});

const machineNamePattern = /^[a-z][a-z0-9_]*$/;
const pathCharactersPattern = /^[A-Za-z0-9._~!$&'()*+,;=:@/-]+$/;

function invalidCustomTool(message: string): never {
	throw new ConvexError({ code: "INVALID_CUSTOM_TOOL", message });
}

export function normalizeCustomToolName(name: string) {
	const normalizedName = name
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
	if (!normalizedName || !machineNamePattern.test(normalizedName)) {
		invalidCustomTool("Tool machine name must start with an ASCII letter.");
	}
	if (normalizedName.length > CUSTOM_TOOL_LIMITS.toolName) {
		invalidCustomTool(
			`Tool machine name must be at most ${CUSTOM_TOOL_LIMITS.toolName} characters.`,
		);
	}
	return normalizedName;
}

function requireTrimmedText(value: string, label: string, maximum: number) {
	const trimmed = value.trim();
	if (!trimmed) invalidCustomTool(`${label} is required.`);
	if (trimmed.length > maximum) {
		invalidCustomTool(`${label} must be at most ${maximum} characters.`);
	}
	return trimmed;
}

export function normalizeCustomIntegrationInput(input: {
	name: string;
	baseUrl: string;
}) {
	return {
		name: requireTrimmedText(
			input.name,
			"Integration name",
			CUSTOM_TOOL_LIMITS.integrationName,
		),
		baseUrl: normalizeCustomIntegrationBaseUrl(input.baseUrl),
	};
}

export function normalizeCustomIntegrationBaseUrl(value: string) {
	const raw = requireTrimmedText(value, "Base URL", CUSTOM_TOOL_LIMITS.baseUrl);
	if (raw.includes("\\") || raw.includes("?") || raw.includes("#")) {
		invalidCustomTool(
			"Base URL cannot contain backslashes, queries, or fragments.",
		);
	}
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		invalidCustomTool("Base URL must be a valid absolute HTTP or HTTPS URL.");
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") {
		invalidCustomTool("Base URL must use HTTP or HTTPS.");
	}
	if (url.username || url.password) {
		invalidCustomTool("Base URL cannot contain user information.");
	}
	if (url.pathname.includes("%") || url.pathname.includes("\\")) {
		invalidCustomTool(
			"Base URL path cannot contain encoded or escaped characters.",
		);
	}
	const segments = url.pathname.split("/");
	if (segments.some((segment) => segment === "." || segment === "..")) {
		invalidCustomTool("Base URL path cannot contain dot segments.");
	}
	url.pathname = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
	return url.toString();
}

export function normalizeCustomToolPath(value: string) {
	const path = requireTrimmedText(value, "Tool path", CUSTOM_TOOL_LIMITS.path);
	if (
		!pathCharactersPattern.test(path) ||
		path.startsWith("/") ||
		path.includes("\\") ||
		path.includes("//") ||
		path.includes("%") ||
		path.includes("?") ||
		path.includes("#")
	) {
		invalidCustomTool(
			"Tool path must not start with a slash or contain escapes, queries, fragments, or duplicate slashes.",
		);
	}
	if (path.split("/").some((segment) => segment === "." || segment === "..")) {
		invalidCustomTool("Tool path cannot contain dot segments.");
	}
	return path;
}

export function normalizeCustomToolFields(
	fields: CustomToolFields,
): CustomToolFields & { normalizedName: string } {
	const name = requireTrimmedText(
		fields.name,
		"Tool name",
		CUSTOM_TOOL_LIMITS.toolName,
	);
	const description = requireTrimmedText(
		fields.description,
		"Tool description",
		CUSTOM_TOOL_LIMITS.toolDescription,
	);
	if (fields.parameters.length > CUSTOM_TOOL_LIMITS.parameterCount) {
		invalidCustomTool(
			`A tool can have at most ${CUSTOM_TOOL_LIMITS.parameterCount} parameters.`,
		);
	}
	const names = new Set<string>();
	const parameters = fields.parameters.map((parameter) => {
		if (names.has(parameter.name)) {
			invalidCustomTool(
				`Parameter ${JSON.stringify(parameter.name)} is duplicated.`,
			);
		}
		names.add(parameter.name);
		return {
			...parameter,
			description: requireTrimmedText(
				parameter.description,
				`Description for ${JSON.stringify(parameter.name)}`,
				CUSTOM_TOOL_LIMITS.parameterDescription,
			),
		};
	});
	return {
		name,
		normalizedName: normalizeCustomToolName(name),
		description,
		path: normalizeCustomToolPath(fields.path),
		parameters,
		requiresApproval: fields.requiresApproval,
	};
}

export function composeCustomToolEndpoint(baseUrl: string, path: string) {
	const normalizedBaseUrl = normalizeCustomIntegrationBaseUrl(baseUrl);
	const normalizedPath = normalizeCustomToolPath(path);
	const base = new URL(normalizedBaseUrl);
	const basePath = base.pathname === "/" ? "" : base.pathname;
	base.pathname = `${basePath}/${normalizedPath}`;
	return base.toString();
}

type CustomToolConfiguration = {
	baseUrl: string;
	path: string;
	parameters: CustomToolParameter[];
};

function canonicalCustomToolConfiguration(input: CustomToolConfiguration) {
	return JSON.stringify({
		baseUrl: normalizeCustomIntegrationBaseUrl(input.baseUrl),
		path: input.path,
		parameters: input.parameters.map((parameter) => ({
			name: parameter.name,
			type: parameter.type,
			description: parameter.description.trim(),
			required: parameter.required,
		})),
	});
}

async function configurationHash(canonical: string) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(canonical),
	);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

export async function computeCustomToolConfigurationHash(
	input: CustomToolConfiguration,
) {
	return await configurationHash(
		canonicalCustomToolConfiguration({
			...input,
			path: normalizeCustomToolPath(input.path),
		}),
	);
}

export async function computeLegacyCustomToolConfigurationHash(
	input: CustomToolConfiguration,
) {
	if (!input.path.startsWith("/")) {
		invalidCustomTool("Legacy tool path must start with a slash.");
	}
	return await configurationHash(
		canonicalCustomToolConfiguration({
			...input,
			path: `/${normalizeCustomToolPath(input.path.slice(1))}`,
		}),
	);
}
