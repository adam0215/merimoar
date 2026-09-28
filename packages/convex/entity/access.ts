import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

type EntityReadContext = Pick<QueryCtx, "db">;

export async function getEntityType(
	ctx: EntityReadContext,
	organizationId: Id<"organizations">,
	entityTypeId: Id<"entityTypes">,
) {
	const entityType = await ctx.db.get(entityTypeId);
	if (
		!entityType ||
		entityType.organizationId !== organizationId ||
		entityType.archivedAt !== null
	) {
		return null;
	}

	return entityType;
}

export async function requireEntityType(
	ctx: EntityReadContext,
	organizationId: Id<"organizations">,
	entityTypeId: Id<"entityTypes">,
) {
	const entityType = await getEntityType(ctx, organizationId, entityTypeId);
	if (!entityType) {
		throw new ConvexError({
			code: "ENTITY_TYPE_NOT_FOUND",
			message: "The entity type could not be found.",
		});
	}

	return entityType;
}
