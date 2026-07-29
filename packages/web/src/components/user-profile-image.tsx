import { useEffect, useRef } from "react";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
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

		return renderProfileMesh(canvas);
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

const VERTEX_SHADER = `
	attribute vec2 aPosition;
	varying vec2 vUv;

	void main() {
		vUv = aPosition * 0.5 + 0.5;
		gl_Position = vec4(aPosition, 0.0, 1.0);
	}
`;

const FRAGMENT_SHADER = `
	precision highp float;

	varying vec2 vUv;
	uniform vec3 uAccent;

	float random(vec2 point) {
		return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
	}

	float valueNoise(vec2 point) {
		vec2 cell = floor(point);
		vec2 offset = fract(point);
		offset = offset * offset * (3.0 - 2.0 * offset);

		return mix(
			mix(random(cell), random(cell + vec2(1.0, 0.0)), offset.x),
			mix(
				random(cell + vec2(0.0, 1.0)),
				random(cell + vec2(1.0, 1.0)),
				offset.x
			),
			offset.y
		);
	}

	float softNoise(vec2 point) {
		return
			valueNoise(point) * 0.72 +
			valueNoise(point * 1.67 + vec2(4.3, -2.8)) * 0.28;
	}

	mat2 rotation(float angle) {
		float sine = sin(angle);
		float cosine = cos(angle);
		return mat2(cosine, -sine, sine, cosine);
	}

	float softVolume(
		vec2 point,
		vec2 center,
		vec2 stretch,
		float angle
	) {
		vec2 distanceFromCenter = rotation(angle) * (point - center);
		distanceFromCenter *= stretch;
		return exp(-dot(distanceFromCenter, distanceFromCenter) * 1.7);
	}

	void main() {
		vec2 seed = vec2(7.7, 17.0);
		vec2 flow = vec2(
			softNoise(vUv * 1.15 + seed),
			softNoise(vUv * 1.08 + seed + vec2(4.7, -2.9))
		) - 0.5;
		vec2 point = vUv + flow * 0.055;

		float broadField =
			0.18 +
			softVolume(point, vec2(0.78, 1.1), vec2(0.64, 0.92), -0.22) * 0.62 +
			softVolume(point, vec2(-0.12, 0.28), vec2(0.86, 1.04), 0.16) * 0.18;
		float detailField =
			softVolume(point, vec2(0.18, 0.8), vec2(2.5, 0.74), -0.4) * 0.23 +
			softVolume(point, vec2(0.46, 0.66), vec2(2.7, 0.82), -0.24) * 0.29 +
			softVolume(point, vec2(0.76, 0.48), vec2(2.45, 0.76), -0.08) * 0.2 -
			softVolume(point, vec2(0.54, 0.26), vec2(1.75, 1.08), 0.1) * 0.14;
		float localFlow = softNoise(point * 3.15 + seed * 0.17);
		float field =
			broadField * 0.24 +
			detailField * 0.58 +
			localFlow * 0.62;
		float body = smoothstep(0.08, 0.76, field);
		float light = smoothstep(0.44, 0.9, field);

		vec3 lowColor = mix(vec3(0.025, 0.055, 0.035), uAccent, 0.19);
		vec3 midColor = mix(vec3(0.14, 0.28, 0.16), uAccent, 0.8);
		vec3 highColor = mix(vec3(0.92, 0.99, 0.9), uAccent, 0.48 * 0.62);
		vec3 color = mix(lowColor, midColor, body);
		color = mix(color, highColor, light * 0.88);

		float grain = random(gl_FragCoord.xy) - 0.5;
		color += grain * 0.055;

		gl_FragColor = vec4(color, 1.0);
	}
`;

function renderProfileMesh(canvas: HTMLCanvasElement) {
	const gl = canvas.getContext("webgl", {
		alpha: false,
		antialias: false,
		preserveDrawingBuffer: false,
	});

	if (!gl) {
		return;
	}

	const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
	const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
	if (!vertexShader || !fragmentShader) {
		return;
	}

	const program = gl.createProgram();
	const buffer = gl.createBuffer();
	if (!program || !buffer) {
		return;
	}

	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		return;
	}

	// Biome reads the WebGL method name as a React hook.
	// biome-ignore lint/correctness/useHookAtTopLevel: This calls the WebGL API.
	gl.useProgram(program);
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.bufferData(
		gl.ARRAY_BUFFER,
		new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
		gl.STATIC_DRAW,
	);

	const position = gl.getAttribLocation(program, "aPosition");
	gl.enableVertexAttribArray(position);
	gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

	const accent = readCssColor("--accent");
	const accentLocation = gl.getUniformLocation(program, "uAccent");
	gl.uniform3f(accentLocation, accent[0], accent[1], accent[2]);

	const draw = () => {
		const bounds = canvas.getBoundingClientRect();
		const density = Math.min(window.devicePixelRatio, 2);
		const width = Math.max(1, Math.round(bounds.width * density));
		const height = Math.max(1, Math.round(bounds.height * density));

		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}

		gl.viewport(0, 0, width, height);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
	};

	const resizeObserver = new ResizeObserver(draw);
	const hideCanvas = () => {
		canvas.hidden = true;
	};

	resizeObserver.observe(canvas);
	canvas.addEventListener("webglcontextlost", hideCanvas);
	draw();

	return () => {
		resizeObserver.disconnect();
		canvas.removeEventListener("webglcontextlost", hideCanvas);
		gl.deleteBuffer(buffer);
		gl.deleteProgram(program);
		gl.deleteShader(vertexShader);
		gl.deleteShader(fragmentShader);
	};
}

function compileShader(
	gl: WebGLRenderingContext,
	type: number,
	source: string,
) {
	const shader = gl.createShader(type);
	if (!shader) {
		return null;
	}

	gl.shaderSource(shader, source);
	gl.compileShader(shader);

	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		gl.deleteShader(shader);
		return null;
	}

	return shader;
}

function readCssColor(variable: string): [number, number, number] {
	const parser = document.createElement("canvas").getContext("2d");
	if (!parser) {
		return [0.15, 0.65, 0.2];
	}

	parser.canvas.width = 1;
	parser.canvas.height = 1;
	parser.fillStyle = getComputedStyle(document.documentElement)
		.getPropertyValue(variable)
		.trim();
	parser.fillRect(0, 0, 1, 1);

	const [red, green, blue] = parser.getImageData(0, 0, 1, 1).data;
	return [red / 255, green / 255, blue / 255];
}

function getInitials(name: string) {
	const parts = name.trim().split(/\s+/);
	const initials =
		parts.length === 1
			? parts[0]?.slice(0, 2)
			: `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`;

	return initials?.toUpperCase() || "U";
}
