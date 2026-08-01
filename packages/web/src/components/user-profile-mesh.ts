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
	uniform float uMotion;
	uniform float uPulse;

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
		float phase = uMotion + uPulse * 0.7;
		float morphA = sin(phase * 0.73);
		float morphB = sin(phase * 0.51 + 1.7) - sin(1.7);
		float morphC = sin(phase * 0.39 + 3.1) - sin(3.1);
		float idleRotation = morphA * 0.04;
		vec2 animatedUv =
			rotation(idleRotation + uPulse * 0.08) * (vUv - 0.5) + 0.5;
		vec2 drift = vec2(
			sin(phase * 0.62),
			cos(phase * 0.47) - 1.0
		) * 0.012;
		vec2 seed = vec2(
			7.7 + sin(phase * 0.38) * 0.24,
			17.0 + sin(phase * 0.31) * 0.2
		);
		vec2 flow = vec2(
			softNoise(animatedUv * 1.15 + seed),
			softNoise(animatedUv * 1.08 + seed + vec2(4.7, -2.9))
		) - 0.5;
		vec2 reshapingFlow = vec2(
			softNoise(animatedUv * 2.25 + seed * 0.31 + vec2(morphB, morphC)),
			softNoise(animatedUv * 2.05 - seed * 0.27 + vec2(morphC, -morphA))
		) - 0.5;
		vec2 point =
			animatedUv +
			drift +
			flow * (0.055 + abs(uPulse) * 0.018) +
			reshapingFlow * (0.04 * abs(morphA) + abs(uPulse) * 0.025);

		float broadField =
			0.18 +
			softVolume(
				point,
				vec2(0.78 + morphA * 0.11, 1.1 + morphB * 0.07),
				vec2(0.64 + morphC * 0.07, 0.92 - morphA * 0.06),
				-0.22 + morphB * 0.16
			) * (0.62 + morphC * 0.05) +
			softVolume(
				point,
				vec2(-0.12 + morphB * 0.09, 0.28 - morphC * 0.08),
				vec2(0.86 - morphA * 0.08, 1.04 + morphB * 0.07),
				0.16 - morphA * 0.13
			) * (0.18 - morphC * 0.035);
		float detailField =
			softVolume(
				point,
				vec2(0.18 + morphC * 0.1, 0.8 - morphA * 0.09),
				vec2(2.5 - morphB * 0.3, 0.74 + morphC * 0.08),
				-0.4 + morphA * 0.19
			) * (0.23 + morphB * 0.035) +
			softVolume(
				point,
				vec2(0.46 - morphA * 0.09, 0.66 + morphB * 0.08),
				vec2(2.7 + morphC * 0.34, 0.82 - morphA * 0.07),
				-0.24 - morphC * 0.16
			) * (0.29 - morphA * 0.04) +
			softVolume(
				point,
				vec2(0.76 + morphB * 0.08, 0.48 + morphC * 0.1),
				vec2(2.45 - morphA * 0.28, 0.76 + morphB * 0.07),
				-0.08 + morphB * 0.2
			) * (0.2 + morphC * 0.035) -
			softVolume(
				point,
				vec2(0.54 - morphC * 0.08, 0.26 + morphA * 0.09),
				vec2(1.75 + morphB * 0.22, 1.08 - morphC * 0.09),
				0.1 - morphA * 0.17
			) * (0.14 + morphB * 0.025);
		float localFlow = softNoise(
			rotation(morphC * 0.22) * point * (3.15 + morphB * 0.28) +
			seed * 0.17
		);
		float breathingField =
			softVolume(
				point,
				vec2(0.34 + morphA * 0.22, 0.52 + morphB * 0.15),
				vec2(1.35 - morphC * 0.18, 1.08 + morphA * 0.16),
				morphB * 0.34
			) * morphA * 0.14 +
			softVolume(
				point,
				vec2(0.72 - morphB * 0.18, 0.68 + morphC * 0.16),
				vec2(1.7 + morphA * 0.22, 1.28 - morphB * 0.18),
				-morphC * 0.38
			) * morphB * 0.11;
		float field =
			broadField * 0.24 +
			detailField * 0.58 +
			localFlow * 0.62 +
			breathingField;
		float body = smoothstep(
			0.08 + morphB * 0.018,
			0.76 - morphA * 0.065,
			field
		);
		float light = smoothstep(
			0.44 + morphC * 0.025,
			0.9 - morphB * 0.055,
			field
		);

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

type ProfileMeshOptions = {
	animated?: boolean;
	reducedMotion?: boolean;
};

export type ProfileMeshController = {
	dispose: () => void;
	pulse: () => void;
};

export function createProfileMesh(
	canvas: HTMLCanvasElement,
	{ animated = false, reducedMotion = false }: ProfileMeshOptions = {},
): ProfileMeshController | undefined {
	const gl = canvas.getContext("webgl", {
		alpha: false,
		antialias: false,
		preserveDrawingBuffer: false,
	});

	if (!gl) {
		return;
	}

	const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
	if (!vertexShader) {
		return;
	}
	const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
	if (!fragmentShader) {
		gl.deleteShader(vertexShader);
		return;
	}

	const program = gl.createProgram();
	if (!program) {
		gl.deleteShader(vertexShader);
		gl.deleteShader(fragmentShader);
		return;
	}
	const buffer = gl.createBuffer();
	if (!buffer) {
		gl.deleteProgram(program);
		gl.deleteShader(vertexShader);
		gl.deleteShader(fragmentShader);
		return;
	}
	const disposeGpuResources = () => {
		gl.deleteBuffer(buffer);
		gl.deleteProgram(program);
		gl.deleteShader(vertexShader);
		gl.deleteShader(fragmentShader);
	};

	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		disposeGpuResources();
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
	const motionLocation = gl.getUniformLocation(program, "uMotion");
	const pulseLocation = gl.getUniformLocation(program, "uPulse");
	gl.uniform3f(accentLocation, accent[0], accent[1], accent[2]);

	let animationFrame = 0;
	let motion = 0;
	let pulse = 0;
	let pulseVelocity = 0;
	let previousTime = performance.now();

	const draw = (time = performance.now()) => {
		const bounds = canvas.getBoundingClientRect();
		const density = Math.min(window.devicePixelRatio, 2);
		const width = Math.max(1, Math.round(bounds.width * density));
		const height = Math.max(1, Math.round(bounds.height * density));

		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}

		if (animated && !reducedMotion) {
			const elapsed = Math.min((time - previousTime) / 1000, 0.05);
			motion += elapsed * (0.85 + Math.abs(pulse) * 2.4);
			pulseVelocity += (-28 * pulse - 7 * pulseVelocity) * elapsed;
			pulse += pulseVelocity * elapsed;
		}
		previousTime = time;

		gl.viewport(0, 0, width, height);
		gl.uniform1f(motionLocation, motion);
		gl.uniform1f(pulseLocation, pulse);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
	};

	const animate = (time: number) => {
		if (!document.hidden) {
			draw(time);
		} else {
			previousTime = time;
		}
		animationFrame = requestAnimationFrame(animate);
	};

	const resizeObserver = new ResizeObserver(() => draw());
	const hideCanvas = () => {
		canvas.hidden = true;
	};

	resizeObserver.observe(canvas);
	canvas.addEventListener("webglcontextlost", hideCanvas);
	draw(previousTime);
	if (animated && !reducedMotion) {
		animationFrame = requestAnimationFrame(animate);
	}

	return {
		pulse: () => {
			if (reducedMotion) {
				return;
			}
			pulseVelocity = Math.min(pulseVelocity + 5.5, 7);
		},
		dispose: () => {
			cancelAnimationFrame(animationFrame);
			resizeObserver.disconnect();
			canvas.removeEventListener("webglcontextlost", hideCanvas);
			disposeGpuResources();
		},
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
