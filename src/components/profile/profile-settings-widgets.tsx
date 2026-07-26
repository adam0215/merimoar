import {
	useAccessToken,
	useAuth,
} from "@workos/authkit-tanstack-react-start/client";
import {
	UserProfile,
	UserSecurity,
	WorkOsWidgets,
	type WorkOsWidgetsProps,
} from "@workos-inc/widgets";
import { useCallback } from "react";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import "./profile-settings-widgets.css";

const WIDGET_THEME = {
	appearance: "inherit",
	accentColor: "gray",
	grayColor: "gray",
	hasBackground: false,
	panelBackground: "solid",
	radius: "large",
	fontFamily: "Inter Variable, sans-serif",
} satisfies WorkOsWidgetsProps["theme"];

const WIDGET_ELEMENTS = {
	avatar: {
		radius: "full",
	},
	primaryButton: {
		highContrast: true,
		radius: "full",
	},
	secondaryButton: {
		radius: "full",
		variant: "surface",
	},
	destructiveButton: {
		color: "red",
		radius: "full",
		variant: "soft",
	},
	iconButton: {
		radius: "full",
	},
	textfield: {
		radius: "large",
		variant: "surface",
	},
	select: {
		radius: "large",
		variant: "surface",
	},
	badge: {
		radius: "full",
		variant: "surface",
	},
	dialog: {
		maxWidth: "32rem",
	},
} satisfies WorkOsWidgetsProps["elements"];

export function ProfileSettingsWidgets() {
	const { loading: authLoading, user } = useAuth();
	const {
		error: tokenError,
		getAccessToken,
		loading: tokenLoading,
	} = useAccessToken();
	const getWidgetToken = useCallback(async () => {
		const token = await getAccessToken();
		if (!token) {
			throw new Error("A signed-in user is required.");
		}
		return token;
	}, [getAccessToken]);

	if (authLoading || tokenLoading) {
		return (
			<WidgetSections>
				<WidgetSection title="Personal information" section="personal">
					<Skeleton className="h-40 rounded-2xl" />
				</WidgetSection>
				<WidgetSection title="Security" section="security">
					<Skeleton className="h-32 rounded-2xl" />
				</WidgetSection>
			</WidgetSections>
		);
	}

	if (!user || tokenError) {
		return (
			<div className="mt-8">
				<Card>
					<CardHeader>
						<CardTitle>Account settings unavailable</CardTitle>
						<CardDescription>
							{tokenError?.message ??
								"A signed-in user is required to manage account settings."}
						</CardDescription>
					</CardHeader>
				</Card>
			</div>
		);
	}

	return (
		<WorkOsWidgets theme={WIDGET_THEME} elements={WIDGET_ELEMENTS}>
			<WidgetSections>
				<WidgetSection title="Personal information" section="personal">
					<UserProfile authToken={getWidgetToken} />
				</WidgetSection>
				<WidgetSection title="Security" section="security">
					<UserSecurity authToken={getWidgetToken} />
				</WidgetSection>
			</WidgetSections>
		</WorkOsWidgets>
	);
}

function WidgetSections({ children }: { children: React.ReactNode }) {
	return <div className="mt-8 grid gap-8">{children}</div>;
}

function WidgetSection({
	children,
	section,
	title,
}: {
	children: React.ReactNode;
	section: "personal" | "security";
	title: string;
}) {
	return (
		<section data-profile-widget-section={section}>
			<div className="mb-3">
				<h2 className="text-base font-medium">{title}</h2>
			</div>
			{children}
		</section>
	);
}
