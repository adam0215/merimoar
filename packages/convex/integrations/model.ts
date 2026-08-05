import { v } from "convex/values";

export const connectionStatusValidator = v.union(
	v.literal("connected"),
	v.literal("needs_reauthorization"),
	v.literal("disconnected"),
);

export type ConnectionStatus = (typeof connectionStatusValidator)["type"];

export const resendWebhookValidator = v.object({
	webhookId: v.string(),
	signingSecret: v.string(),
	provisionedAt: v.number(),
});

export const connectedAccountSnapshotValidator = v.object({
	workosConnectedAccountId: v.string(),
	workosDataIntegrationId: v.string(),
	providerSlug: v.string(),
	workosUserId: v.string(),
	workosOrganizationId: v.string(),
	grantedScopes: v.array(v.string()),
	connectionStatus: connectionStatusValidator,
	workosUpdatedAt: v.number(),
});

export type ConnectedAccountSnapshot =
	(typeof connectedAccountSnapshotValidator)["type"];

export const emailIntegrationAccessContextValidator = v.object({
	integrationId: v.id("emailIntegrations"),
	connectedAccountId: v.id("connectedAccounts"),
	organizationId: v.id("organizations"),
	providerSlug: v.string(),
	connectionStatus: connectionStatusValidator,
	grantedScopes: v.array(v.string()),
	workosUpdatedAt: v.number(),
	workosUserId: v.string(),
	workosOrganizationId: v.string(),
	resendWebhook: v.optional(resendWebhookValidator),
});

export type EmailIntegrationAccessContext =
	(typeof emailIntegrationAccessContextValidator)["type"];

export const resendProvisioningFenceValidator = v.object({
	integrationId: v.id("emailIntegrations"),
	expectedConnectedAccountId: v.id("connectedAccounts"),
	expectedWorkosUpdatedAt: v.number(),
});

export type ResendProvisioningFence =
	(typeof resendProvisioningFenceValidator)["type"];

export const emailReadinessValidator = v.object({
	inbound: v.union(
		v.literal("connection_inactive"),
		v.literal("missing_scope"),
		v.literal("provisioning"),
		v.literal("ready"),
	),
	outbound: v.union(
		v.literal("connection_inactive"),
		v.literal("missing_scope"),
		v.literal("ready"),
	),
});

export type EmailReadiness = (typeof emailReadinessValidator)["type"];

export function deriveEmailReadiness(
	connectionStatus: ConnectionStatus,
	grantedScopes: readonly string[],
	hasResendWebhook: boolean,
): EmailReadiness {
	if (connectionStatus !== "connected") {
		return {
			inbound: "connection_inactive",
			outbound: "connection_inactive",
		};
	}
	if (!grantedScopes.includes("full_access")) {
		return { inbound: "missing_scope", outbound: "missing_scope" };
	}
	return {
		inbound: hasResendWebhook ? "ready" : "provisioning",
		outbound: "ready",
	};
}
