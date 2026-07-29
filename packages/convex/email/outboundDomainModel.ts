import type { Domain } from "resend";

export function listVerifiedResendDomainNames(
	domains: Pick<Domain, "name" | "status">[],
) {
	return domains
		.filter((domain) => domain.status === "verified")
		.map((domain) => domain.name)
		.sort((first, second) => first.localeCompare(second));
}
