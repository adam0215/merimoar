import { selectIngestRecipientAddresses } from "#/email/ingestRecipients";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function routeEmailToOrganizationInbox(
	ctx: Pick<MutationCtx, "db">,
	organizationId: Id<"organizations">,
	recipients: {
		receivedForAddresses: string[];
		toAddresses: string[];
	},
) {
	const recipientAddresses = selectIngestRecipientAddresses(recipients);
	const candidateInboxes = await Promise.all(
		recipientAddresses.map((address) =>
			ctx.db
				.query("emailInboxes")
				.withIndex("by_organization_id_and_address", (query) =>
					query.eq("organizationId", organizationId).eq("address", address),
				)
				.unique(),
		),
	);

	return {
		inbox: candidateInboxes.find((candidate) => candidate?.status === "active"),
		recipientAddresses,
	};
}
