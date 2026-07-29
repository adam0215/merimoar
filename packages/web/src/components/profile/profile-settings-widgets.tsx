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
import { useCallback, useEffect, useRef, useState } from "react";
import { AppSplashScreen } from "#/components/app-splash-screen.tsx";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card.tsx";
import { cn } from "#/lib/utils.ts";
import "#/components/profile/profile-settings-widgets.css";

const WIDGET_THEME = {
	appearance: "inherit",
	accentColor: "gray",
	grayColor: "gray",
	hasBackground: false,
	panelBackground: "solid",
	radius: "large",
	fontFamily: "TikTok Sans Variable, sans-serif",
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
	const [widgetsReady, setWidgetsReady] = useState(false);
	const widgetContainerRef = useRef<HTMLDivElement>(null);
	const getWidgetToken = useCallback(async () => {
		const token = await getAccessToken();
		if (!token) {
			throw new Error("A signed-in user is required.");
		}
		return token;
	}, [getAccessToken]);
	const widgetsCanLoad = !authLoading && !tokenLoading && Boolean(user);

	useEffect(() => {
		setWidgetsReady(false);
		if (!widgetsCanLoad || !widgetContainerRef.current) {
			return;
		}

		const container = widgetContainerRef.current;
		const updateReadyState = () => {
			const widgetRoots = Array.from(
				container.querySelectorAll("[data-woswidgets-widget-state]"),
			);
			setWidgetsReady(
				widgetRoots.length === 2 &&
					widgetRoots.every(
						(widgetRoot) =>
							widgetRoot.getAttribute("data-woswidgets-widget-state") !==
							"loading",
					),
			);
		};
		const observer = new MutationObserver(updateReadyState);
		observer.observe(container, {
			attributeFilter: ["data-woswidgets-widget-state"],
			attributes: true,
			childList: true,
			subtree: true,
		});
		updateReadyState();

		return () => observer.disconnect();
	}, [widgetsCanLoad]);

	if (authLoading || tokenLoading) {
		return <AppSplashScreen className="fixed inset-0 z-50 min-h-0" />;
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
		<>
			<div
				ref={widgetContainerRef}
				className={cn(
					!widgetsReady && "invisible",
					widgetsReady && "app-shell-enter",
				)}
			>
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
			</div>
			{!widgetsReady && (
				<AppSplashScreen className="fixed inset-0 z-50 min-h-0" />
			)}
		</>
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
