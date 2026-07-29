import type { Doc } from "../_generated/dataModel";

export type InboxOutboundConfiguration = NonNullable<
	Doc<"emailInboxes">["outbound"]
>;

export function getOutboundConfiguration(inbox: Doc<"emailInboxes">) {
	return (
		inbox.outbound ??
		(inbox.outboundIntegrationId
			? {
					integrationId: inbox.outboundIntegrationId,
					address: inbox.address,
				}
			: undefined)
	);
}

export function createOutboundConfigurationPatch(
	outbound: InboxOutboundConfiguration | undefined,
) {
	return {
		outbound,
		outboundIntegrationId: outbound?.integrationId,
	};
}
