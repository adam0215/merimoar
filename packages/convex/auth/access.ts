import type { UserIdentity } from "convex/server";
import { ConvexError } from "convex/values";
import { getWorkosUser } from "#/workos";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type AuthenticatedContext = Pick<
	QueryCtx | MutationCtx,
	"auth" | "db" | "runQuery"
>;

type OrganizationAccess =
	| { status: "unauthenticated" }
	| { status: "organization_required" }
	| { status: "organization_not_provisioned" }
	| {
			status: "provisioned";
			identity: UserIdentity;
			organization: Doc<"organizations">;
	  };

type OrganizationAccessFailure = Exclude<
	OrganizationAccess,
	{ status: "provisioned" }
>["status"];

function throwOrganizationAccessError(
	status: OrganizationAccessFailure,
): never {
	if (status === "unauthenticated") {
		throw new ConvexError({
			code: "UNAUTHENTICATED",
			message: "Sign in to continue.",
		});
	}
	if (status === "organization_required") {
		throw new ConvexError({
			code: "ORGANIZATION_REQUIRED",
			message: "Choose a WorkOS organization to continue.",
		});
	}
	throw new ConvexError({
		code: "ORGANIZATION_NOT_PROVISIONED",
		message: "This WorkOS organization is not provisioned.",
	});
}

async function resolveOrganizationAccess(
	ctx: AuthenticatedContext,
): Promise<OrganizationAccess> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		return { status: "unauthenticated" };
	}

	const workosOrganizationId = identity.org_id;
	if (typeof workosOrganizationId !== "string" || !workosOrganizationId) {
		return { status: "organization_required" };
	}

	const organization = await ctx.db
		.query("organizations")
		.withIndex("by_workos_organization_id", (index) =>
			index.eq("workosOrganizationId", workosOrganizationId),
		)
		.unique();
	if (!organization || !organization.active) {
		return { status: "organization_not_provisioned" };
	}

	return { status: "provisioned", identity, organization };
}

export async function resolveActorAccess(ctx: AuthenticatedContext) {
	const workspace = await resolveOrganizationAccess(ctx);
	if (workspace.status !== "provisioned") {
		return workspace;
	}
	const [member, user] = await Promise.all([
		ctx.db
			.query("organizationMembers")
			.withIndex("by_organization_id_and_workos_user_id", (index) =>
				index
					.eq("organizationId", workspace.organization._id)
					.eq("workosUserId", workspace.identity.subject),
			)
			.unique(),
		getWorkosUser(ctx, workspace.identity.subject),
	]);
	if (!member || !user) {
		return { status: "not_synced" } as const;
	}
	if (!member.active) {
		return { status: "inactive" } as const;
	}

	return { ...workspace, status: "active", member, user } as const;
}

export async function requireOrganization(ctx: AuthenticatedContext) {
	const workspace = await resolveOrganizationAccess(ctx);
	if (workspace.status !== "provisioned") {
		throwOrganizationAccessError(workspace.status);
	}

	return {
		identity: workspace.identity,
		organization: workspace.organization,
	};
}

export async function requireActor(ctx: AuthenticatedContext) {
	const access = await resolveActorAccess(ctx);
	if (access.status === "active") {
		return {
			identity: access.identity,
			organization: access.organization,
			member: access.member,
			user: access.user,
		};
	}
	if (
		access.status === "unauthenticated" ||
		access.status === "organization_required" ||
		access.status === "organization_not_provisioned"
	) {
		throwOrganizationAccessError(access.status);
	}
	throw new ConvexError({
		code: "MEMBERSHIP_REQUIRED",
		message: "An active WorkOS organization membership is required.",
	});
}
