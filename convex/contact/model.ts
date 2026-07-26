import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { normalizeEmailAddress } from "../email/normalize";

export async function upsertSenderContact(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	from: {
		address: string;
		name?: string;
	},
	receivedAt: number,
) {
	const address = normalizeEmailAddress(from.address);
	const existingContact = await ctx.db
		.query("contacts")
		.withIndex("by_organization_id_and_address", (query) =>
			query.eq("organizationId", organizationId).eq("address", address),
		)
		.unique();

	if (!existingContact) {
		return await ctx.db.insert("contacts", {
			organizationId,
			address,
			name: from.name,
			firstSeenAt: receivedAt,
			lastSeenAt: receivedAt,
		});
	}

	const name =
		from.name &&
		(!existingContact.name || receivedAt >= existingContact.lastSeenAt)
			? from.name
			: existingContact.name;
	const firstSeenAt = Math.min(existingContact.firstSeenAt, receivedAt);
	const lastSeenAt = Math.max(existingContact.lastSeenAt, receivedAt);

	if (
		name !== existingContact.name ||
		firstSeenAt !== existingContact.firstSeenAt ||
		lastSeenAt !== existingContact.lastSeenAt
	) {
		await ctx.db.patch(existingContact._id, {
			name,
			firstSeenAt,
			lastSeenAt,
		});
	}

	return existingContact._id;
}
