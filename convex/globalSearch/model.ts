import { type Infer, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";

const MAX_BACKFILL_DOCUMENTS_PER_TABLE = 1_000;

export const globalSearchTargetValidator = v.union(
	v.object({
		kind: v.literal("contact"),
		contactId: v.id("contacts"),
	}),
	v.object({
		kind: v.literal("case"),
		caseId: v.id("cases"),
	}),
	v.object({
		kind: v.literal("entity"),
		entityId: v.id("entities"),
		entityTypeId: v.id("entityTypes"),
	}),
);

export type GlobalSearchTarget = Infer<typeof globalSearchTargetValidator>;

type SearchEntryFields = {
	organizationId: Id<"organizations">;
	target: GlobalSearchTarget;
	identifier: string;
	label: string;
	descriptor: string;
};

function buildSearchText(fields: SearchEntryFields) {
	return [fields.identifier, fields.label, fields.descriptor].join(" ");
}

export async function syncGlobalSearchEntry(
	ctx: MutationCtx,
	entryId: Id<"globalSearchEntries"> | undefined,
	fields: SearchEntryFields,
) {
	const entry = {
		...fields,
		searchText: buildSearchText(fields),
	};

	if (entryId) {
		await ctx.db.replace("globalSearchEntries", entryId, entry);
		return entryId;
	}

	return await ctx.db.insert("globalSearchEntries", entry);
}

export const backfillExistingSearchEntries = internalMutation({
	args: {},
	returns: v.object({
		contacts: v.number(),
		cases: v.number(),
		entities: v.number(),
	}),
	handler: async (ctx) => {
		const [contacts, cases, entities] = await Promise.all([
			ctx.db.query("contacts").take(MAX_BACKFILL_DOCUMENTS_PER_TABLE + 1),
			ctx.db.query("cases").take(MAX_BACKFILL_DOCUMENTS_PER_TABLE + 1),
			ctx.db.query("entities").take(MAX_BACKFILL_DOCUMENTS_PER_TABLE + 1),
		]);

		assertBackfillFitsInOneTransaction("contacts", contacts.length);
		assertBackfillFitsInOneTransaction("cases", cases.length);
		assertBackfillFitsInOneTransaction("entities", entities.length);

		for (const contact of contacts) {
			const globalSearchEntryId = await syncGlobalSearchEntry(
				ctx,
				contact.globalSearchEntryId,
				{
					organizationId: contact.organizationId,
					target: { kind: "contact", contactId: contact._id },
					identifier: contact.address,
					label: contact.name ?? contact.address,
					descriptor: "Contact",
				},
			);
			if (globalSearchEntryId !== contact.globalSearchEntryId) {
				await ctx.db.patch("contacts", contact._id, {
					globalSearchEntryId,
				});
			}
		}

		for (const caseRecord of cases) {
			const globalSearchEntryId = await syncGlobalSearchEntry(
				ctx,
				caseRecord.globalSearchEntryId,
				{
					organizationId: caseRecord.organizationId,
					target: { kind: "case", caseId: caseRecord._id },
					identifier: caseRecord.reference,
					label: caseRecord.title,
					descriptor: "Case",
				},
			);
			if (globalSearchEntryId !== caseRecord.globalSearchEntryId) {
				await ctx.db.patch("cases", caseRecord._id, {
					globalSearchEntryId,
				});
			}
		}

		let indexedEntities = 0;
		for (const entity of entities) {
			const entityType = await ctx.db.get(entity.entityTypeId);
			if (
				entity.archivedAt !== null ||
				!entityType ||
				entityType.archivedAt !== null
			) {
				continue;
			}

			const globalSearchEntryId = await syncGlobalSearchEntry(
				ctx,
				entity.globalSearchEntryId,
				{
					organizationId: entityType.organizationId,
					target: {
						kind: "entity",
						entityId: entity._id,
						entityTypeId: entityType._id,
					},
					identifier: entity.identifier,
					label: entity.displayName,
					descriptor: entityType.name,
				},
			);
			if (globalSearchEntryId !== entity.globalSearchEntryId) {
				await ctx.db.patch("entities", entity._id, {
					globalSearchEntryId,
				});
			}
			indexedEntities += 1;
		}

		return {
			contacts: contacts.length,
			cases: cases.length,
			entities: indexedEntities,
		};
	},
});

function assertBackfillFitsInOneTransaction(table: string, count: number) {
	if (count > MAX_BACKFILL_DOCUMENTS_PER_TABLE) {
		throw new Error(
			`${table} exceeds the ${MAX_BACKFILL_DOCUMENTS_PER_TABLE}-document one-time backfill limit.`,
		);
	}
}
