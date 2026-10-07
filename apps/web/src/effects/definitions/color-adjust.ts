import type { ParamValues } from "@/params";
import type { EffectDefinition } from "@/effects/types";

export type FilterChannel =
	| "brightness"
	| "contrast"
	| "saturate"
	| "hueRotate"
	| "sepia"
	| "grayscale"
	| "invert";

export type FilterChannels = Partial<Record<FilterChannel, number>>;

const NEUTRAL: Record<FilterChannel, number> = {
	brightness: 1,
	contrast: 1,
	saturate: 1,
	hueRotate: 0,
	sepia: 0,
	grayscale: 0,
	invert: 0,
};

const CSS_NAME: Record<FilterChannel, string> = {
	brightness: "brightness",
	contrast: "contrast",
	saturate: "saturate",
	hueRotate: "hue-rotate",
	sepia: "sepia",
	grayscale: "grayscale",
	invert: "invert",
};

function round(value: number): number {
	return Math.round(value * 10000) / 10000;
}

/** 强度 0~1 在中性与目标之间线性插值，让预设滤镜带一个「浓度」滑杆 */
export function mixChannels({
	target,
	amount,
}: {
	target: FilterChannels;
	amount: number;
}): FilterChannels {
	const t = Math.min(1, Math.max(0, amount));
	const mixed: FilterChannels = {};
	for (const channel of Object.keys(target) as FilterChannel[]) {
		const from = NEUTRAL[channel];
		const to = target[channel] ?? from;
		mixed[channel] = from + (to - from) * t;
	}
	return mixed;
}

export function buildFilter({ channels }: { channels: FilterChannels }): string {
	const parts: string[] = [];
	for (const channel of Object.keys(CSS_NAME) as FilterChannel[]) {
		const value = channels[channel];
		if (value === undefined || Math.abs(value - NEUTRAL[channel]) < 0.0001) {
			continue;
		}
		const arg =
			channel === "hueRotate" ? `${round(value)}deg` : String(round(value));
		parts.push(`${CSS_NAME[channel]}(${arg})`);
	}
	return parts.join(" ");
}

export function numberParam({
	params,
	key,
	fallback,
}: {
	params: ParamValues;
	key: string;
	fallback: number;
}): number {
	const raw = params[key];
	if (typeof raw === "number" && Number.isFinite(raw)) {
		return raw;
	}
	const parsed = Number.parseFloat(String(raw ?? ""));
	return Number.isFinite(parsed) ? parsed : fallback;
}

type ChannelEffectConfig = {
	type: string;
	name: string;
	keywords: string[];
	min: number;
	max: number;
	default: number;
	toChannel: (value: number) => FilterChannels;
};

function channelEffect({
	type,
	name,
	keywords,
	min,
	max,
	default: defaultValue,
	toChannel,
}: ChannelEffectConfig): EffectDefinition {
	return {
		type,
		name,
		keywords,
		params: [
			{
				key: "intensity",
				label: "Intensity",
				type: "number",
				default: defaultValue,
				min,
				max,
				step: 1,
			},
		],
		renderer: {
			passes: [],
			canvas2d: ({ effectParams }) => ({
				filter: buildFilter({
					channels: toChannel(
						numberParam({
							params: effectParams,
							key: "intensity",
							fallback: defaultValue,
						}),
					),
				}),
			}),
		},
	};
}

const percentTo = (channel: FilterChannel) => (value: number) =>
	({ [channel]: value / 100 }) as FilterChannels;
const gainTo = (channel: FilterChannel) => (value: number) =>
	({ [channel]: 1 + value / 100 }) as FilterChannels;

export const colorAdjustEffects: EffectDefinition[] = [
	channelEffect({
		type: "mw-brightness",
		name: "Brightness",
		keywords: ["brightness", "exposure", "light"],
		min: -100,
		max: 100,
		default: 20,
		toChannel: gainTo("brightness"),
	}),
	channelEffect({
		type: "mw-contrast",
		name: "Contrast",
		keywords: ["contrast", "punch"],
		min: -100,
		max: 100,
		default: 20,
		toChannel: gainTo("contrast"),
	}),
	channelEffect({
		type: "mw-saturation",
		name: "Saturation",
		keywords: ["saturation", "vivid", "color"],
		min: -100,
		max: 100,
		default: 20,
		toChannel: gainTo("saturate"),
	}),
	channelEffect({
		type: "mw-hue",
		name: "Hue",
		keywords: ["hue", "color shift"],
		min: -180,
		max: 180,
		default: 15,
		toChannel: (value) => ({ hueRotate: value }),
	}),
	channelEffect({
		type: "mw-blackwhite",
		name: "Black & White",
		keywords: ["grayscale", "monochrome", "black"],
		min: 0,
		max: 100,
		default: 100,
		toChannel: percentTo("grayscale"),
	}),
	channelEffect({
		type: "mw-sepia",
		name: "Sepia",
		keywords: ["sepia", "old", "warm"],
		min: 0,
		max: 100,
		default: 60,
		toChannel: percentTo("sepia"),
	}),
	channelEffect({
		type: "mw-invert",
		name: "Invert",
		keywords: ["invert", "negative"],
		min: 0,
		max: 100,
		default: 100,
		toChannel: percentTo("invert"),
	}),
];
