/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { createTest, syncWorkosUser } from "../test.setup";
import { MAX_FIELDS_PER_ENTITY_TYPE } from "./constants";

// TEST FIXTURES: The Merimoar organization, people, emails, and WorkOS-style
// identifiers below exist only in convex-test's isolated in-memory database.
const ISSUER = "https://api.workos.com/";

async function createFixture() {
	const base = createTest();
	await Promise.all([
		syncWorkosUser(base, {
			id: "user_adam",
			name: "Adam Gustafsson",
			email: "adam@merimoar.com",
		}),
		syncWorkosUser(base, {
			id: "user_other",
			name: "Other User",
			email: "other@example.com",
		}),
	]);
	const ids = await base.run(async (ctx) => {
		const organizationId = await ctx.db.insert("organizations", {
			name: "Merimoar",
			workosOrganizationId: "org_merimoar",
			active: true,
		});
		const otherOrganizationId = await ctx.db.insert("organizations", {
			name: "Other",
			workosOrganizationId: "org_other",
			active: true,
		});
		await ctx.db.insert("organizationMembers", {
			organizationId,
			workosUserId: "user_adam",
			active: true,
		});
		await ctx.db.insert("organizationMembers", {
			organizationId: otherOrganizationId,
			workosUserId: "user_other",
			active: true,
		});
		return { organizationId, otherOrganizationId };
	});
	return {
		base,
		actor: base.withIdentity({
			issuer: ISSUER,
			subject: "user_adam",
			org_id: "org_merimoar",
		}),
		otherActor: base.withIdentity({
			issuer: ISSUER,
			subject: "user_other",
			org_id: "org_other",
		}),
		...ids,
	};
}

async function createPropertyType(
	actor: Awaited<ReturnType<typeof createFixture>>["actor"],
) {
	return await actor.mutation(api.entity.mutations.createType, {
		name: "Property",
		pluralName: "Properties",
		identifierLabel: "Property ID",
		description: "Properties represented by the brokerage.",
		icon: "home",
	});
}

describe("entity configuration", () => {
	it("stores one discriminated API value per normalized typed row", async () => {
		const { actor } = await createFixture();
		const entityTypeId = await createPropertyType(actor);
		const addressFieldId = await actor.mutation(api.entity.mutations.addField, {
			entityTypeId,
			label: "Street address",
			key: "Street Address",
			valueType: "text",
			required: true,
		});
		const priceFieldId = await actor.mutation(api.entity.mutations.addField, {
			entityTypeId,
			label: "Asking price",
			key: "Asking Price",
			valueType: "number",
			required: false,
		});

		const entityId = await actor.mutation(api.entity.mutations.createEntity, {
			entityTypeId,
			identifier: " FAST-1042 ",
			displayName: "Storgatan 12",
			values: [
				{
					kind: "text",
					fieldDefinitionId: addressFieldId,
					value: "  Storgatan 12  ",
				},
				{
					kind: "number",
					fieldDefinitionId: priceFieldId,
					value: 8_950_000,
				},
			],
		});

		const state = await actor.run(async (ctx) => ({
			entity: await ctx.db.get(entityId),
			textValues: await ctx.db
				.query("entityTextFieldValues")
				.withIndex("by_entity_id_and_field_definition_id", (index) =>
					index.eq("entityId", entityId),
				)
				.collect(),
			numberValues: await ctx.db
				.query("entityNumberFieldValues")
				.withIndex("by_entity_id_and_field_definition_id", (index) =>
					index.eq("entityId", entityId),
				)
				.collect(),
		}));

		expect(state.entity).toMatchObject({
			identifier: "FAST-1042",
			normalizedIdentifier: "fast-1042",
			displayName: "Storgatan 12",
		});
		expect(state.textValues).toMatchObject([{ value: "Storgatan 12" }]);
		expect(state.numberValues).toMatchObject([{ value: 8_950_000 }]);
	});

	it("rejects blank required text and non-finite number/date values", async () => {
		const { actor } = await createFixture();
		const entityTypeId = await createPropertyType(actor);
		const addressFieldId = await actor.mutation(api.entity.mutations.addField, {
			entityTypeId,
			label: "Address",
			key: "address",
			valueType: "text",
			required: true,
		});
		const priceFieldId = await actor.mutation(api.entity.mutations.addField, {
			entityTypeId,
			label: "Price",
			key: "price",
			valueType: "number",
			required: false,
		});
		const dateFieldId = await actor.mutation(api.entity.mutations.addField, {
			entityTypeId,
			label: "Inspection date",
			key: "inspection-date",
			valueType: "date",
			required: false,
		});

		await expect(
			actor.mutation(api.entity.mutations.createEntity, {
				entityTypeId,
				identifier: "FAST-1",
				displayName: "Blank address",
				values: [
					{
						kind: "text",
						fieldDefinitionId: addressFieldId,
						value: "   ",
					},
				],
			}),
		).rejects.toThrow("Address is required");

		for (const invalidValue of [Number.NaN, Number.POSITIVE_INFINITY]) {
			await expect(
				actor.mutation(api.entity.mutations.createEntity, {
					entityTypeId,
					identifier: `FAST-${String(invalidValue)}`,
					displayName: "Invalid number",
					values: [
						{
							kind: "text",
							fieldDefinitionId: addressFieldId,
							value: "Storgatan 12",
						},
						{
							kind: "number",
							fieldDefinitionId: priceFieldId,
							value: invalidValue,
						},
					],
				}),
			).rejects.toThrow("finite number");
		}

		await expect(
			actor.mutation(api.entity.mutations.createEntity, {
				entityTypeId,
				identifier: "FAST-DATE",
				displayName: "Invalid date",
				values: [
					{
						kind: "text",
						fieldDefinitionId: addressFieldId,
						value: "Storgatan 12",
					},
					{
						kind: "date",
						fieldDefinitionId: dateFieldId,
						value: Number.NEGATIVE_INFINITY,
					},
				],
			}),
		).rejects.toThrow("finite number");

		const entities = await actor.run(async (ctx) =>
			ctx.db.query("entities").collect(),
		);
		expect(entities).toHaveLength(0);
	});

	it("rejects a missing required boolean at the server boundary", async () => {
		const { actor } = await createFixture();
		const entityTypeId = await createPropertyType(actor);
		await actor.mutation(api.entity.mutations.addField, {
			entityTypeId,
			label: "Approved",
			key: "approved",
			valueType: "boolean",
			required: true,
		});

		await expect(
			actor.mutation(api.entity.mutations.createEntity, {
				entityTypeId,
				identifier: "FAST-BOOLEAN",
				displayName: "Missing approval",
				values: [],
			}),
		).rejects.toThrow("Approved is required");
	});

	it("rejects unauthenticated and cross-tenant configuration", async () => {
		const { base, actor, otherActor } = await createFixture();
		await expect(
			base.mutation(api.entity.mutations.createType, {
				name: "Contract",
				pluralName: "Contracts",
				identifierLabel: "Contract number",
				description: "",
				icon: "contract",
			}),
		).rejects.toThrow("Sign in");

		const entityTypeId = await createPropertyType(actor);
		await expect(
			otherActor.mutation(api.entity.mutations.addField, {
				entityTypeId,
				label: "Cross tenant",
				key: "cross-tenant",
				valueType: "text",
				required: false,
			}),
		).rejects.toThrow("could not be found");
		expect(
			await otherActor.query(api.entity.reader.getType, { entityTypeId }),
		).toBeNull();
	});

	it("enforces the field cap and never hides active rows behind archived rows", async () => {
		const { actor } = await createFixture();
		const entityTypeId = await createPropertyType(actor);
		await actor.run(async (ctx) => {
			for (
				let position = 0;
				position < MAX_FIELDS_PER_ENTITY_TYPE;
				position += 1
			) {
				await ctx.db.insert("entityFieldDefinitions", {
					entityTypeId,
					key: `field-${position}`,
					label: `Field ${position}`,
					valueType: "text",
					required: false,
					position,
					archivedAt: null,
				});
			}
		});

		await expect(
			actor.mutation(api.entity.mutations.addField, {
				entityTypeId,
				label: "One too many",
				key: "one-too-many",
				valueType: "text",
				required: false,
			}),
		).rejects.toThrow(`at most ${MAX_FIELDS_PER_ENTITY_TYPE}`);

		const archivedTypeId = await actor.mutation(
			api.entity.mutations.createType,
			{
				name: "Contract",
				pluralName: "Contracts",
				identifierLabel: "Contract number",
				description: "",
				icon: "contract",
			},
		);
		await actor.run(async (ctx) => {
			for (
				let position = 0;
				position < MAX_FIELDS_PER_ENTITY_TYPE;
				position += 1
			) {
				await ctx.db.insert("entityFieldDefinitions", {
					entityTypeId: archivedTypeId,
					key: `archived-${position}`,
					label: `Archived ${position}`,
					valueType: "text",
					required: false,
					position,
					archivedAt: 1,
				});
			}
			await ctx.db.insert("entityFieldDefinitions", {
				entityTypeId: archivedTypeId,
				key: "active",
				label: "Active",
				valueType: "text",
				required: false,
				position: MAX_FIELDS_PER_ENTITY_TYPE,
				archivedAt: null,
			});
		});

		const detail = await actor.query(api.entity.reader.getType, {
			entityTypeId: archivedTypeId,
		});
		expect(detail?.fieldDefinitions.map((field) => field.key)).toEqual([
			"active",
		]);
	});
});
