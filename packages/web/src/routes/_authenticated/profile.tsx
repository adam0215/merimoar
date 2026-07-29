import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@workos/authkit-tanstack-react-start/client";
import { RetroDither } from "#/components/canvasui/RetroDither.tsx";
import { ProfileSettingsWidgets } from "#/components/profile/profile-settings-widgets.tsx";
import { UserProfileImage } from "#/components/user-profile-image.tsx";
import { coverImageForId } from "#/lib/cover-image.ts";

export const Route = createFileRoute("/_authenticated/profile")({
	component: ProfilePage,
});

function ProfilePage() {
	const { user } = useAuth();
	const displayName =
		[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Profile";

	return (
		<div className="h-full overflow-y-auto">
			<div className="min-h-full w-full p-6">
				<div className="h-28 overflow-hidden rounded-xl bg-accent/40">
					<RetroDither
						className="size-full"
						pixelSize={2}
						levels={5}
						radius={1.3}
						softness={0.55}
						contrast={0.9}
						colorize={0.05}
						baseStrength={0.4}
						strength={1}
					>
						<img
							src={coverImageForId(user?.id ?? "")}
							alt=""
							className="size-full object-cover"
						/>
					</RetroDither>
				</div>
				<header className="-mt-14 grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-x-4 lg:px-6">
					<UserProfileImage
						name={displayName}
						size="large"
						className="row-span-2"
					/>
					<h1 className="col-start-2 row-start-1 mt-16 truncate text-xl font-semibold tracking-tight">
						{displayName}
					</h1>
					{user?.email && (
						<p className="col-start-2 row-start-2 truncate text-sm text-muted-foreground">
							{user.email}
						</p>
					)}
				</header>

				<ProfileSettingsWidgets />
			</div>
		</div>
	);
}
