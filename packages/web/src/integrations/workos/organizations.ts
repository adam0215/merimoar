export type AvailableOrganization = {
	name: string;
	workosOrganizationId: string;
};

const WORKOS_ORGANIZATION_ID_PATTERN = /^org_[A-Za-z0-9]+$/;

export function parseWorkOSOrganizationId(value: unknown): string {
	if (
		typeof value !== "string" ||
		!WORKOS_ORGANIZATION_ID_PATTERN.test(value)
	) {
		throw new Error("A valid WorkOS organization ID is required.");
	}
	return value;
}
