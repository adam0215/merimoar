import { describe, expect, it } from "vitest";
import { listVerifiedResendDomainNames } from "#/email/outboundDomainModel";
import {
	createConnectedResendIntegration,
	createTest,
	syncWorkosUser,
} from "#/test.setup";
import { internal } from "../_generated/api";

const ISSUER = "https://api.workos.com/";

describe("outbound domains", () => {
	it("returns only domains whose aggregate Resend status is verified", () => {
		expect(
			listVerifiedResendDomainNames([
				{ name: "pending.example", status: "pending" },
				{ name: "z.example", status: "verified" },
				{ name: "partial.example", status: "partially_verified" },
				{ name: "a.example", status: "verified" },
				{ name: "failed.example", status: "failed" },
			]),
		).toEqual(["a.example", "z.example"]);
	});

	it("exposes a connected integration only to its organization", async () => {
		const test = createTest();
		await Promise.all([
			syncWorkosUser(test, {
				id: "user_adam",
				name: "Adam",
				email: "adam@merimoar.com",
			}),
			syncWorkosUser(test, {
				id: "user_other",
				name: "Other",
				email: "other@example.com",
			}),
		]);
		const { organizationId, otherOrganizationId } = await test.run(
			async (ctx) => {
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
			},
		);
		const integrationId = await createConnectedResendIntegration(
			test,
			organizationId,
		);
		const actor = test.withIdentity({
			issuer: ISSUER,
			subject: "user_adam",
			org_id: "org_merimoar",
		});
		const otherActor = test.withIdentity({
			issuer: ISSUER,
			subject: "user_other",
			org_id: "org_other",
		});

		await expect(
			actor.query(
				internal.email.integrations.getSelectableResendAccessContext,
				{ integrationId },
			),
		).resolves.toMatchObject({
			_id: integrationId,
			provider: "resend",
		});
		await expect(
			otherActor.query(
				internal.email.integrations.getSelectableResendAccessContext,
				{ integrationId },
			),
		).resolves.toBeNull();

		await test.run(async (ctx) => {
			await ctx.db.patch(integrationId, { status: "disconnected" });
		});
		await expect(
			actor.query(
				internal.email.integrations.getSelectableResendAccessContext,
				{ integrationId },
			),
		).resolves.toBeNull();

		expect(otherOrganizationId).toBeDefined();
	});
});
