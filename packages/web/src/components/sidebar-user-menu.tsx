import {
	IconDeviceDesktop,
	IconDots,
	IconMoon,
	IconSun,
} from "@tabler/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@workos/authkit-tanstack-react-start/client";
import { useRef } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "#/components/ui/sidebar.tsx";
import { UserProfileImage } from "#/components/user-profile-image.tsx";
import { type ThemeMode, useTheme } from "#/hooks/use-theme.ts";
import { cn } from "#/lib/utils.ts";

const THEME_OPTIONS = [
	{ value: "light", label: "Light", icon: IconSun },
	{ value: "auto", label: "System", icon: IconDeviceDesktop },
	{ value: "dark", label: "Dark", icon: IconMoon },
] satisfies Array<{
	value: ThemeMode;
	label: string;
	icon: typeof IconSun;
}>;

export function SidebarUserMenu() {
	const { signOut, user } = useAuth();
	const { setTheme, theme } = useTheme();
	const portalContainerRef = useRef<HTMLElement | null>(null);
	const profileIsActive = useRouterState({
		select: (state) => state.location.pathname === "/profile",
	});
	const displayName =
		[user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
		user?.email ||
		"User";

	return (
		<SidebarMenu className="mt-2 border-t border-sidebar-border pt-2">
			<DropdownMenu>
				<SidebarMenuItem
					ref={(node) => {
						portalContainerRef.current =
							node?.closest<HTMLElement>('[role="dialog"]') ?? null;
					}}
				>
					<DropdownMenuTrigger
						render={
							<SidebarMenuButton
								size="lg"
								isActive={profileIsActive}
								tooltip={displayName}
								className="text-muted-foreground data-active:text-foreground data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
							/>
						}
					>
						<UserProfileImage name={displayName} />
						<span className="flex min-w-0 flex-1 flex-col">
							<span className="truncate font-medium text-foreground">
								{displayName}
							</span>
							{user?.email && (
								<span className="truncate text-xs font-normal text-muted-foreground">
									{user.email}
								</span>
							)}
						</span>
						<IconDots className="ml-auto text-muted-foreground group-data-[collapsible=icon]:hidden" />
					</DropdownMenuTrigger>
					<DropdownMenuContent
						side="top"
						align="start"
						sideOffset={8}
						container={portalContainerRef}
						className="min-w-64"
					>
						<DropdownMenuItem render={<Link to="/profile" />}>
							<span>My profile</span>
						</DropdownMenuItem>

						<div className="flex items-center gap-3 px-3 py-1.5 text-sm">
							<span>Appearance</span>
							<DropdownMenuRadioGroup
								value={theme}
								onValueChange={(value) => {
									if (
										value === "light" ||
										value === "auto" ||
										value === "dark"
									) {
										setTheme(value);
									}
								}}
								aria-label="Appearance"
								className="ml-auto flex items-center gap-0.5"
							>
								{THEME_OPTIONS.map((option) => (
									<DropdownMenuRadioItem
										key={option.value}
										value={option.value}
										label={option.label}
										aria-label={option.label}
										title={option.label}
										className="size-7 justify-center rounded-full p-0 text-muted-foreground data-checked:bg-muted data-checked:text-foreground data-highlighted:bg-muted data-highlighted:text-foreground [&_[data-slot=dropdown-menu-radio-item-indicator]]:hidden"
									>
										<option.icon
											className={cn(
												"size-3.5",
												option.value === theme
													? "text-foreground"
													: "text-muted-foreground",
											)}
										/>
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</div>

						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={() => void signOut()}>
							<span>Sign out</span>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</SidebarMenuItem>
			</DropdownMenu>
		</SidebarMenu>
	);
}
