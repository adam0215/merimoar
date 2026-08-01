import { useEffect, useRef } from "react";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { createProfileMesh } from "#/components/user-profile-mesh.ts";
import { cn } from "#/lib/utils.ts";
import "#/components/user-avatar-mesh.css";

export function UserProfileImage({
	className,
	name,
	size = "default",
}: {
	className?: string;
	name: string;
	size?: "default" | "large";
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}

		const mesh = createProfileMesh(canvas);
		return () => mesh?.dispose();
	}, []);

	return (
		<Avatar
			role="img"
			aria-label={`${name} profile image`}
			className={cn(
				size === "large" && "size-28 border-4 border-background",
				className,
			)}
		>
			<AvatarFallback
				className={cn("user-avatar-mesh", size === "large" && "text-3xl")}
			>
				<canvas ref={canvasRef} className="user-avatar-mesh-canvas" />
				<span>{getInitials(name)}</span>
			</AvatarFallback>
		</Avatar>
	);
}

function getInitials(name: string) {
	const parts = name.trim().split(/\s+/);
	const initials =
		parts.length === 1
			? parts[0]?.slice(0, 2)
			: `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`;

	return initials?.toUpperCase() || "U";
}
