import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import {
	createProfileMesh,
	type ProfileMeshController,
} from "#/components/user-profile-mesh.ts";
import { cn } from "#/lib/utils.ts";
import "#/components/user-avatar-mesh.css";

export function AgentOrb({
	className,
	pulseKey,
}: {
	className?: string;
	pulseKey?: string;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const meshRef = useRef<ProfileMeshController>(null);
	const previousPulseKey = useRef(pulseKey);
	const reducedMotion = useReducedMotion() ?? false;

	useEffect(() => {
		if (!previousPulseKey.current) {
			previousPulseKey.current = pulseKey;
			return;
		}
		if (pulseKey && pulseKey !== previousPulseKey.current) {
			meshRef.current?.pulse();
			previousPulseKey.current = pulseKey;
		}
	}, [pulseKey]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}

		const mesh = createProfileMesh(canvas, {
			animated: true,
			reducedMotion,
		});
		meshRef.current = mesh ?? null;

		return () => {
			meshRef.current = null;
			mesh?.dispose();
		};
	}, [reducedMotion]);

	return (
		<span
			role="img"
			aria-label="Agent activity"
			className={cn(
				"user-avatar-mesh block size-9 shrink-0 overflow-hidden rounded-full shadow-sm",
				className,
			)}
		>
			<canvas ref={canvasRef} aria-hidden className="user-avatar-mesh-canvas" />
		</span>
	);
}
