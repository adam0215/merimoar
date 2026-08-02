import { useAuth } from "@workos/authkit-tanstack-react-start/client";
import { useState } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { switchActiveOrganization } from "#/integrations/workos/organization-functions.ts";
import type { AvailableOrganization } from "#/integrations/workos/organizations.ts";
import { showAppNotification } from "#/lib/app-notifications.ts";
import { cn } from "#/lib/utils.ts";

const ORGANIZATION_NAME_TYPOGRAPHY_CLASS_NAME =
	"text-base font-semibold tracking-tight";
const ORGANIZATION_NAME_FADE_CLASS_NAME =
	"min-w-0 overflow-hidden whitespace-nowrap mask-[linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]";

export function OrganizationSwitcher({
	organizations,
}: {
	organizations: AvailableOrganization[];
}) {
	const { loading, organizationId } = useAuth();
	const [isSwitching, setIsSwitching] = useState(false);
	const selectedOrganization =
		organizations.find(
			(organization) => organization.workosOrganizationId === organizationId,
		) ?? organizations[0];

	if (!selectedOrganization) {
		return null;
	}

	if (organizations.length === 1) {
		return (
			<p
				className={cn(
					"px-2",
					ORGANIZATION_NAME_TYPOGRAPHY_CLASS_NAME,
					ORGANIZATION_NAME_FADE_CLASS_NAME,
				)}
				title={selectedOrganization.name}
			>
				{selectedOrganization.name}
			</p>
		);
	}

	const items = organizations.map((organization) => ({
		label: organization.name,
		value: organization.workosOrganizationId,
	}));

	return (
		<Select
			items={items}
			value={selectedOrganization.workosOrganizationId}
			onValueChange={(nextOrganizationId) => {
				if (
					nextOrganizationId === null ||
					nextOrganizationId === organizationId
				) {
					return;
				}

				setIsSwitching(true);
				void switchActiveOrganization({ data: nextOrganizationId })
					.then(() => {
						window.location.reload();
					})
					.catch((error: unknown) => {
						showAppNotification({
							title: "Organization could not be changed",
							description:
								error instanceof Error ? error.message : String(error),
						});
						setIsSwitching(false);
					});
			}}
		>
			<SelectTrigger
				aria-label="Organization"
				disabled={loading || isSwitching}
				className={cn(
					"h-9 w-full max-w-full border-0 bg-transparent px-2 py-0 shadow-none hover:bg-muted focus-visible:ring-2 dark:hover:bg-muted",
					ORGANIZATION_NAME_TYPOGRAPHY_CLASS_NAME,
				)}
			>
				<SelectValue className={ORGANIZATION_NAME_FADE_CLASS_NAME} />
			</SelectTrigger>
			<SelectContent align="start" className="w-max min-w-56">
				{organizations.map((organization) => (
					<SelectItem
						key={organization.workosOrganizationId}
						value={organization.workosOrganizationId}
					>
						{organization.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
