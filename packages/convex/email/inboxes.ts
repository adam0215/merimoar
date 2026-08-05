import { ConvexError, v } from "convex/values";
import * as validation from "valibot";
import { requireActor } from "#/auth/access";
import {
	emailInboxAddressSchema,
	emailInboxDetailsSchema,
} from "#/email/input";
import { normalizeEmailAddress } from "#/email/normalize";
import { getEmailIntegrationAccessContext } from "#/integrations/connectedAccounts";
import { deriveEmailReadiness } from "#/integrations/model";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { mutation } from "../_generated/server";

async function requireSelectableOutboundIntegration(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	outbound: {
		integrationId: Id<"emailIntegrations">;
		address: string;
	} | null,
) {
	if (outbound === null) {
		return undefined;
	}

	const addressResult = validation.safeParse(
		emailInboxAddressSchema,
		outbound.address,
	);
	if (!addressResult.success) {
		throw new ConvexError({
			code: "INVALID_OUTBOUND_ADDRESS",
			message:
				addressResult.issues[0]?.message ?? "Enter a valid outbound address.",
		});
	}

	const integration = await getEmailIntegrationAccessContext(
		ctx,
		outbound.integrationId,
	);
	if (!integration || integration.organizationId !== organizationId) {
		throw new ConvexError({
			code: "EMAIL_INTEGRATION_NOT_FOUND",
			message: "The email integration could not be found.",
		});
	}
	if (
		deriveEmailReadiness(
			integration.connectionStatus,
			integration.grantedScopes,
			integration.resendWebhook !== undefined,
		).outbound !== "ready"
	) {
		throw new ConvexError({
			code: "EMAIL_INTEGRATION_NOT_CONNECTED",
			message: "Connect the email integration before selecting it.",
		});
	}

	return {
		integrationId: integration.integrationId,
		address: normalizeEmailAddress(addressResult.output),
	};
}

function requireValidInboxDetails({
	displayName,
	address,
}: {
	displayName: string;
	address: string;
}) {
	const result = validation.safeParse(emailInboxDetailsSchema, {
		displayName,
		address,
	});
	if (!result.success) {
		throw new ConvexError({
			code: "INVALID_INBOX",
			message: result.issues[0]?.message ?? "Enter valid inbox details.",
		});
	}
	return {
		displayName: result.output.displayName,
		address: normalizeEmailAddress(result.output.address),
	};
}

async function findInboxAtAddress(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	address: string,
) {
	return await ctx.db
		.query("emailInboxes")
		.withIndex("by_organization_id_and_address", (query) =>
			query.eq("organizationId", organizationId).eq("address", address),
		)
		.unique();
}

function throwAddressAlreadyUsed(): never {
	throw new ConvexError({
		code: "ADDRESS_ALREADY_USED",
		message: "This organization already has an inbox with that address.",
	});
}

const outboundConfigurationValidator = v.union(
	v.object({
		integrationId: v.id("emailIntegrations"),
		address: v.string(),
	}),
	v.null(),
);

export const create = mutation({
	args: {
		displayName: v.string(),
		address: v.string(),
		outbound: outboundConfigurationValidator,
	},
	returns: v.id("emailInboxes"),
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		const details = requireValidInboxDetails(args);
		const outbound = await requireSelectableOutboundIntegration(
			ctx,
			workspace.organization._id,
			args.outbound,
		);
		const existingInbox = await findInboxAtAddress(
			ctx,
			workspace.organization._id,
			details.address,
		);

		if (existingInbox) {
			if (existingInbox.status === "disabled") {
				await ctx.db.patch(existingInbox._id, {
					displayName: details.displayName,
					outbound,
					status: "active",
				});
				return existingInbox._id;
			}
			throwAddressAlreadyUsed();
		}

		return await ctx.db.insert("emailInboxes", {
			organizationId: workspace.organization._id,
			...details,
			outbound,
			status: "active",
			unreadThreadCount: 0,
		});
	},
});

export const update = mutation({
	args: {
		inboxId: v.id("emailInboxes"),
		displayName: v.string(),
		address: v.string(),
		outbound: outboundConfigurationValidator,
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		const inbox = await ctx.db.get(args.inboxId);
		if (!inbox || inbox.organizationId !== workspace.organization._id) {
			throw new ConvexError({
				code: "EMAIL_INBOX_NOT_FOUND",
				message: "The email inbox could not be found.",
			});
		}

		const details = requireValidInboxDetails(args);
		const inboxAtAddress = await findInboxAtAddress(
			ctx,
			workspace.organization._id,
			details.address,
		);
		if (inboxAtAddress && inboxAtAddress._id !== inbox._id) {
			throwAddressAlreadyUsed();
		}

		const requestedOutboundAddress = args.outbound
			? normalizeEmailAddress(args.outbound.address)
			: undefined;
		const currentOutbound = inbox.outbound;
		const outboundIsUnchanged =
			args.outbound?.integrationId === currentOutbound?.integrationId &&
			requestedOutboundAddress === currentOutbound?.address;
		const outbound = outboundIsUnchanged
			? currentOutbound
			: await requireSelectableOutboundIntegration(
					ctx,
					workspace.organization._id,
					args.outbound,
				);

		await ctx.db.patch(inbox._id, {
			...details,
			outbound,
		});
		return null;
	},
});

export const remove = mutation({
	args: {
		inboxId: v.id("emailInboxes"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const workspace = await requireActor(ctx);
		const inbox = await ctx.db.get(args.inboxId);
		if (!inbox || inbox.organizationId !== workspace.organization._id) {
			throw new ConvexError({
				code: "EMAIL_INBOX_NOT_FOUND",
				message: "The email inbox could not be found.",
			});
		}

		await ctx.db.patch(inbox._id, { status: "disabled" });
		return null;
	},
});
