import { defaultAgentDefinition } from "@merimoar/agent/manifest";
import {
	invokeCustomToolRequest,
	validateCustomToolInput,
} from "@merimoar/agent/runtime/custom-tool-request";
import {
	composeCustomToolEndpoint,
	computeCustomToolConfigurationHash,
	normalizeCustomIntegrationInput,
	normalizeCustomToolFields,
} from "@merimoar/convex/agent/custom-tool-model";
import { api } from "@merimoar/convex/api";
import type { Id } from "@merimoar/convex/data-model";
import { createServerFn } from "@tanstack/react-start";
import { getAuth } from "@workos/authkit-tanstack-react-start";
import * as validation from "valibot";
import { createAuthenticatedConvexHttpClient } from "#/integrations/convex/server.ts";
import {
	createCustomToolTestProof,
	hashCustomToolTestInput,
	verifyCustomToolTestProof,
} from "../../../server/custom-tools/test-proof.ts";

const parameterSchema = validation.strictObject({
	name: validation.string(),
	type: validation.picklist(["string", "number", "boolean"]),
	description: validation.string(),
	required: validation.boolean(),
});

const toolFieldsSchema = validation.strictObject({
	name: validation.string(),
	description: validation.string(),
	path: validation.string(),
	parameters: validation.array(parameterSchema),
	requiresApproval: validation.boolean(),
});

const integrationSelectionSchema = validation.variant("kind", [
	validation.strictObject({
		kind: validation.literal("existing"),
		integrationId: validation.string(),
	}),
	validation.strictObject({
		kind: validation.literal("inline"),
		name: validation.string(),
		baseUrl: validation.string(),
	}),
]);

const testRequestSchema = validation.strictObject({
	integration: integrationSelectionSchema,
	fields: toolFieldsSchema,
	testValues: validation.unknown(),
});

const saveRequestSchema = validation.strictObject({
	toolId: validation.optional(validation.string()),
	integration: integrationSelectionSchema,
	fields: toolFieldsSchema,
	testProof: validation.optional(validation.string()),
	testValues: validation.optional(validation.unknown()),
});

type TestRequest = validation.InferOutput<typeof testRequestSchema>;

async function prepareCustomToolRequest(
	data: Pick<TestRequest, "integration" | "fields">,
) {
	const auth = await getAuth();
	if (!auth.user || !auth.organizationId) {
		throw new Error("An active organization is required.");
	}
	const secret = process.env.AGENT_RUNTIME_SECRET;
	if (!secret || secret.length < 32) {
		throw new Error("Custom tool server is not configured.");
	}
	const client = await createAuthenticatedConvexHttpClient();
	const { normalizedName: _normalizedName, ...fields } =
		normalizeCustomToolFields(data.fields);
	const baseUrl =
		data.integration.kind === "inline"
			? normalizeCustomIntegrationInput(data.integration).baseUrl
			: (
					await client.query(api.agent.customTools.getIntegrationForTest, {
						integrationId: data.integration
							.integrationId as Id<"customIntegrations">,
					})
				).baseUrl;
	const configuration = {
		endpoint: composeCustomToolEndpoint(baseUrl, fields.path),
		parameters: fields.parameters,
	};
	return {
		principal: {
			organizationId: auth.organizationId,
			principalId: auth.user.id,
		},
		secret,
		client,
		fields,
		configuration,
		configurationHash: await computeCustomToolConfigurationHash({
			baseUrl,
			path: fields.path,
			parameters: fields.parameters,
		}),
	};
}

export const testCustomTool = createServerFn({ method: "POST" })
	.validator((input: unknown) => validation.parse(testRequestSchema, input))
	.handler(async ({ data }) => {
		const { principal, secret, fields, configuration, configurationHash } =
			await prepareCustomToolRequest(data);
		const validatedInput = validateCustomToolInput(
			fields.parameters,
			data.testValues,
		);
		const result = await invokeCustomToolRequest(configuration, validatedInput);
		const testInputHash = await hashCustomToolTestInput(
			fields.parameters,
			validatedInput,
		);
		return {
			endpoint: result.endpoint,
			status: result.status,
			durationMs: result.durationMs,
			jsonPreview: JSON.stringify(result.value, null, 2),
			testProof: createCustomToolTestProof(
				{ ...principal, configurationHash, testInputHash },
				secret,
			),
		};
	});

export const saveCustomTool = createServerFn({ method: "POST" })
	.validator((input: unknown) => validation.parse(saveRequestSchema, input))
	.handler(async ({ data }) => {
		const { principal, secret, client, fields, configurationHash } =
			await prepareCustomToolRequest(data);
		if (data.testProof) {
			if (!data.testValues) {
				throw new Error("Test input is required with a custom tool proof.");
			}
			const validatedInput = validateCustomToolInput(
				fields.parameters,
				data.testValues,
			);
			const testInputHash = await hashCustomToolTestInput(
				fields.parameters,
				validatedInput,
			);
			verifyCustomToolTestProof(
				data.testProof,
				{ ...principal, configurationHash, testInputHash },
				secret,
			);
		} else {
			if (!data.toolId) {
				throw new Error("Test the current tool configuration before saving.");
			}
			const saved = await client.query(api.agent.customTools.getToolForSave, {
				toolId: data.toolId as Id<"agentCustomTools">,
			});
			if (saved.testedConfigurationHash !== configurationHash) {
				throw new Error("Test the current tool configuration before saving.");
			}
		}
		return await client.mutation(api.agent.customTools.saveTestedTool, {
			runtimeSecret: secret,
			...(data.toolId ? { toolId: data.toolId as Id<"agentCustomTools"> } : {}),
			agentKey: defaultAgentDefinition.key,
			integration:
				data.integration.kind === "existing"
					? {
							kind: "existing" as const,
							integrationId: data.integration
								.integrationId as Id<"customIntegrations">,
						}
					: data.integration,
			fields,
			testedConfigurationHash: configurationHash,
			builtInTools: [...defaultAgentDefinition.builtInTools],
		});
	});
