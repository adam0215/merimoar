import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { EntitySettings } from "#/components/entity/entity-settings.tsx";
import { api } from "../../../../../convex/_generated/api";

type EntitySettingsSearch = {
	type?: string;
};

export const Route = createFileRoute(
	"/_authenticated/settings/organization/entities",
)({
	validateSearch: (search: Record<string, unknown>): EntitySettingsSearch => ({
		type: typeof search.type === "string" ? search.type : undefined,
	}),
	component: OrganizationEntitySettings,
});

function OrganizationEntitySettings() {
	const { type: selectedTypeId } = Route.useSearch();
	const navigate = useNavigate({
		from: "/settings/organization/entities",
	});
	const entityTypes = useQuery(api.entity.reader.listTypes, {});
	const detail = useQuery(
		api.entity.reader.getType,
		selectedTypeId ? { entityTypeId: selectedTypeId } : "skip",
	);

	return (
		<EntitySettings
			entityTypes={entityTypes}
			selectedTypeId={selectedTypeId}
			detail={detail}
			onTypeCreated={(entityTypeId) =>
				navigate({ search: { type: entityTypeId } })
			}
		/>
	);
}
