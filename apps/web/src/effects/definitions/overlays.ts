import { converter, parse } from "culori";
import type { ParamValues } from "@/params";
import type { EffectDefinition } from "@/effects/types";
import { numberParam } from "./color-adjust";

const toRgb = converter("rgb");

function withAlpha({ color, alpha }: { color: string; alpha: number }): string {
	const parsed = parse(color);
	const rgb = parsed ? toRgb(parsed) : null;
	const r = Math.round((rgb?.r ?? 0) * 255);
	const g = Math.round((rgb?.g ?? 0) * 255);
	const b = Math.round((rgb?.b ?? 0) * 255);
	return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function intensity({
	effectParams,
	fallback,
}: {
	effectParams: ParamValues;
	fallback: number;
}): number {
	return numberParam({
		params: effectParams,
		key: "intensity",
		fallback,
	}) / 100;
}

/**
 * 叠加一律用 source-atop：只染到该元素已有的不透明像素上，透明区域保持干净，
 * 贴纸/抠像素材不会被糊上一层噪点或暗角。
 */
function paintOverlays(
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	paint: () => void,
) {
	ctx.save();
	ctx.globalCompositeOperation = "source-atop";
	paint();
	ctx.restore();
}

const NOISE_TILE_SIZE = 128;
const noiseTiles = new Map<string, HTMLCanvasElement>();

function getNoiseTile({ seedStep }: { seedStep: number }): HTMLCanvasElement {
	const cacheKey = `${seedStep}`;
	const cached = noiseTiles.get(cacheKey);
	if (cached) {
		return cached;
	}

	const canvas = document.createElement("canvas");
	canvas.width = NOISE_TILE_SIZE;
	canvas.height = NOISE_TILE_SIZE;
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		throw new Error("Failed to get 2d context for noise tile");
	}
	const image = ctx.createImageData(NOISE_TILE_SIZE, NOISE_TILE_SIZE);
	for (let i = 0; i < image.data.length; i += 4) {
		// 中灰附近抖动：0.5 附近的不规则偏移，叠加后接近「加颗粒」而非加色
		const v = 128 + (Math.random() - 0.5) * seedStep * 255;
		image.data[i] = v;
		image.data[i + 1] = v;
		image.data[i + 2] = v;
		image.data[i + 3] = 255;
	}
	ctx.putImageData(image, 0, 0);
	noiseTiles.set(cacheKey, canvas);
	return canvas;
}

export const overlayEffects: EffectDefinition[] = [
	{
		type: "mw-vignette",
		name: "Vignette",
		keywords: ["vignette", "dark corners", "edge"],
		params: [
			{ key: "intensity", label: "Intensity", type: "number", default: 55, min: 0, max: 100, step: 1 },
			{ key: "size", label: "Size", type: "number", default: 35, min: 0, max: 100, step: 1 },
			{ key: "color", label: "Color", type: "color", default: "#000000" },
		],
		renderer: {
			passes: [],
			canvas2d: ({ effectParams }) => {
				const amount = intensity({ effectParams, fallback: 55 });
				const inner = numberParam({ params: effectParams, key: "size", fallback: 35 }) / 100;
				const color = String(effectParams.color ?? "#000000");
				if (amount <= 0) {
					return {};
				}
				return {
					paint: ({ ctx, width, height }) => {
						const cx = width / 2;
						const cy = height / 2;
						const outer = Math.hypot(cx, cy);
						const gradient = ctx.createRadialGradient(
							cx,
							cy,
							outer * Math.min(0.98, inner),
							cx,
							cy,
							outer,
						);
						gradient.addColorStop(0, withAlpha({ color, alpha: 0 }));
						gradient.addColorStop(1, withAlpha({ color, alpha: amount }));
						paintOverlays(ctx, () => {
							ctx.fillStyle = gradient;
							ctx.fillRect(0, 0, width, height);
						});
					},
				};
			},
		},
	},
	{
		type: "mw-grain",
		name: "Grain",
		keywords: ["grain", "noise", "film"],
		params: [
			{ key: "intensity", label: "Intensity", type: "number", default: 35, min: 0, max: 100, step: 1 },
			{ key: "scale", label: "Scale", type: "number", default: 2, min: 1, max: 8, step: 1 },
		],
		renderer: {
			passes: [],
			canvas2d: ({ effectParams }) => {
				const amount = intensity({ effectParams, fallback: 35 });
				const scale = Math.max(
					1,
					Math.round(numberParam({ params: effectParams, key: "scale", fallback: 2 })),
				);
				if (amount <= 0) {
					return {};
				}
				return {
					paint: ({ ctx, width, height }) => {
						const tile = getNoiseTile({ seedStep: 0.5 });
						const pattern = ctx.createPattern(tile, "repeat");
						if (!pattern) {
							return;
						}
						if (scale > 1) {
							pattern.setTransform(new DOMMatrix().scale(scale));
						}
						paintOverlays(ctx, () => {
							ctx.globalAlpha = amount;
							ctx.fillStyle = pattern;
							ctx.fillRect(0, 0, width, height);
						});
					},
				};
			},
		},
	},
	{
		type: "mw-scanlines",
		name: "Scanlines",
		keywords: ["scanlines", "crt", "retro", "tv"],
		params: [
			{ key: "intensity", label: "Intensity", type: "number", default: 40, min: 0, max: 100, step: 1 },
			{ key: "lines", label: "Lines", type: "number", default: 240, min: 40, max: 900, step: 10 },
			{ key: "color", label: "Color", type: "color", default: "#000000" },
		],
		renderer: {
			passes: [],
			canvas2d: ({ effectParams }) => {
				const amount = intensity({ effectParams, fallback: 40 });
				const lines = Math.max(
					1,
					Math.round(numberParam({ params: effectParams, key: "lines", fallback: 240 })),
				);
				const color = String(effectParams.color ?? "#000000");
				if (amount <= 0) {
					return {};
				}
				return {
					paint: ({ ctx, width, height }) => {
						const gap = height / lines;
						paintOverlays(ctx, () => {
							ctx.fillStyle = withAlpha({ color, alpha: amount });
							for (let y = 0; y < height; y += gap) {
								ctx.fillRect(0, y, width, Math.max(1, gap * 0.5));
							}
						});
					},
				};
			},
		},
	},
	{
		type: "mw-lightleak",
		name: "Light Leak",
		keywords: ["light leak", "glow", "sun flare"],
		params: [
			{ key: "intensity", label: "Intensity", type: "number", default: 45, min: 0, max: 100, step: 1 },
			{ key: "color", label: "Color", type: "color", default: "#ff7a3c" },
			{
				key: "direction",
				label: "Direction",
				type: "select",
				default: "left",
				options: [
					{ value: "left", label: "From left" },
					{ value: "right", label: "From right" },
					{ value: "top", label: "From top" },
					{ value: "bottom", label: "From bottom" },
				],
			},
		],
		renderer: {
			passes: [],
			canvas2d: ({ effectParams }) => {
				const amount = intensity({ effectParams, fallback: 45 });
				const color = String(effectParams.color ?? "#ff7a3c");
				const direction = String(effectParams.direction ?? "left");
				if (amount <= 0) {
					return {};
				}
				return {
					paint: ({ ctx, width, height }) => {
						const [x0, y0, x1, y1] =
							direction === "right"
								? [width, 0, 0, 0]
								: direction === "top"
									? [0, 0, 0, height]
									: direction === "bottom"
										? [0, height, 0, 0]
										: [0, 0, width, 0];
						const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
						gradient.addColorStop(0, withAlpha({ color, alpha: amount }));
						gradient.addColorStop(0.55, withAlpha({ color, alpha: amount * 0.35 }));
						gradient.addColorStop(1, withAlpha({ color, alpha: 0 }));
						paintOverlays(ctx, () => {
							ctx.fillStyle = gradient;
							ctx.fillRect(0, 0, width, height);
						});
					},
				};
			},
		},
	},
	{
		type: "mw-letterbox",
		name: "Cinemascope",
		keywords: ["letterbox", "bars", "cinema", "frame"],
		params: [
			{ key: "size", label: "Size", type: "number", default: 12, min: 0, max: 40, step: 1 },
			{ key: "color", label: "Color", type: "color", default: "#000000" },
		],
		renderer: {
			passes: [],
			canvas2d: ({ effectParams }) => {
				const percent = Math.min(
					40,
					Math.max(0, numberParam({ params: effectParams, key: "size", fallback: 12 })),
				) / 100;
				const color = String(effectParams.color ?? "#000000");
				if (percent <= 0) {
					return {};
				}
				return {
					paint: ({ ctx, width, height }) => {
						const halfBar = (height * percent) / 2;
						paintOverlays(ctx, () => {
							ctx.fillStyle = color;
							ctx.fillRect(0, 0, width, halfBar);
							ctx.fillRect(0, height - halfBar, width, halfBar);
						});
					},
				};
			},
		},
	},
];
