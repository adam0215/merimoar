import type { EntityIconKey } from "@merimoar/convex/entity/constants";

export type { EntityIconKey };

import {
	IconBox,
	IconBriefcase,
	IconBuilding,
	IconBuildingEstate,
	IconCalendarEvent,
	IconCar,
	IconContract,
	IconFileInvoice,
	IconHeartbeat,
	IconHome,
	IconMapPin,
	IconPackage,
	IconPaw,
	type IconProps,
	IconShieldCheck,
	IconTools,
	IconTruck,
	IconUser,
	IconUsers,
	type TablerIcon,
} from "@tabler/icons-react";

export const ENTITY_ICON_OPTIONS: ReadonlyArray<{
	key: EntityIconKey;
	label: string;
	icon: TablerIcon;
}> = [
	{ key: "box", label: "General", icon: IconBox },
	{ key: "user", label: "Person", icon: IconUser },
	{ key: "users", label: "People", icon: IconUsers },
	{ key: "building", label: "Company", icon: IconBuilding },
	{ key: "briefcase", label: "Work", icon: IconBriefcase },
	{ key: "home", label: "Home", icon: IconHome },
	{ key: "estate", label: "Property", icon: IconBuildingEstate },
	{ key: "contract", label: "Contract", icon: IconContract },
	{ key: "invoice", label: "Invoice", icon: IconFileInvoice },
	{ key: "shield", label: "Insurance", icon: IconShieldCheck },
	{ key: "car", label: "Vehicle", icon: IconCar },
	{ key: "truck", label: "Logistics", icon: IconTruck },
	{ key: "package", label: "Product", icon: IconPackage },
	{ key: "paw", label: "Animal", icon: IconPaw },
	{ key: "heartbeat", label: "Health", icon: IconHeartbeat },
	{ key: "calendar", label: "Event", icon: IconCalendarEvent },
	{ key: "map-pin", label: "Location", icon: IconMapPin },
	{ key: "tools", label: "Tools", icon: IconTools },
];

const ICON_BY_KEY = new Map(
	ENTITY_ICON_OPTIONS.map((option) => [option.key, option.icon] as const),
);

export function EntityIcon({
	icon,
	...props
}: IconProps & { icon: EntityIconKey }) {
	const Component = ICON_BY_KEY.get(icon) ?? IconBox;
	return <Component {...props} />;
}
