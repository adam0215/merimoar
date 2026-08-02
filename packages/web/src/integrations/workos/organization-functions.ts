import { createServerFn } from "@tanstack/react-start";
import {
	getAuth,
	switchToOrganization,
} from "@workos/authkit-tanstack-react-start";
import { createWorkOSClient } from "#/integrations/workos/client.ts";
import {
	type AvailableOrganization,
	parseWorkOSOrganizationId,
} from "#/integrations/workos/organizations.ts";

export const loadAvailableOrganizations = createServerFn({
	method: "GET",
}).handler(async (): Promise<AvailableOrganization[]> => {
	const auth = await getAuth();
	if (!auth.user) {
		return [];
	}

	try {
		const memberships =
			await createWorkOSClient().userManagement.listOrganizationMemberships({
				userId: auth.user.id,
				statuses: ["active"],
				limit: 100,
			});
		return memberships.data.map((membership) => ({
			name: membership.organizationName,
			workosOrganizationId: membership.organizationId,
		}));
	} catch (error) {
		console.error("Could not load WorkOS organizations.", error);
		return [];
	}
});

export const switchActiveOrganization = createServerFn({
	method: "POST",
})
	.validator(parseWorkOSOrganizationId)
	.handler(async ({ data: organizationId }): Promise<void> => {
		const auth = await switchToOrganization({
			data: { organizationId },
		});
		if (!auth.user || auth.organizationId !== organizationId) {
			throw new Error("WorkOS did not switch to the requested organization.");
		}
	});
