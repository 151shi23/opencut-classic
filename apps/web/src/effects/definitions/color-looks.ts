import type { EffectDefinition } from "@/effects/types";
import {
	buildFilter,
	mixChannels,
	numberParam,
	type FilterChannels,
} from "./color-adjust";

type LookConfig = {
	type: string;
	name: string;
	keywords: string[];
	channels: FilterChannels;
};

const DEFAULT_AMOUNT = 70;

function lookEffect({ type, name, keywords, channels }: LookConfig): EffectDefinition {
	return {
		type,
		name,
		keywords,
		params: [
			{
				key: "intensity",
				label: "Intensity",
				type: "number",
				default: DEFAULT_AMOUNT,
				min: 0,
				max: 100,
				step: 1,
			},
		],
		renderer: {
			passes: [],
			canvas2d: ({ effectParams }) => ({
				filter: buildFilter({
					channels: mixChannels({
						target: channels,
						amount:
							numberParam({
								params: effectParams,
								key: "intensity",
								fallback: DEFAULT_AMOUNT,
							}) / 100,
					}),
				}),
			}),
		},
	};
}

export const colorLookEffects: EffectDefinition[] = [
	lookEffect({
		type: "mw-look-noir",
		name: "Noir",
		keywords: ["noir", "black white", "film"],
		channels: { grayscale: 1, contrast: 1.35, brightness: 0.96 },
	}),
	lookEffect({
		type: "mw-look-vintage",
		name: "Vintage Film",
		keywords: ["vintage", "retro", "film"],
		channels: { sepia: 0.45, saturate: 0.8, contrast: 0.92, brightness: 1.06 },
	}),
	lookEffect({
		type: "mw-look-fresh",
		name: "Fresh",
		keywords: ["fresh", "bright", "clean"],
		channels: { saturate: 1.28, contrast: 1.08, brightness: 1.06, hueRotate: -6 },
	}),
	lookEffect({
		type: "mw-look-warm",
		name: "Warm Sun",
		keywords: ["warm", "sunset", "sun"],
		channels: { sepia: 0.3, saturate: 1.25, brightness: 1.08, hueRotate: -8 },
	}),
	lookEffect({
		type: "mw-look-cool",
		name: "Cool Blue",
		keywords: ["cool", "blue", "winter"],
		channels: { saturate: 1.15, contrast: 1.06, brightness: 1.02, hueRotate: 24 },
	}),
	lookEffect({
		type: "mw-look-teal",
		name: "Teal Orange",
		keywords: ["teal", "orange", "blockbuster"],
		channels: { saturate: 1.45, contrast: 1.2, brightness: 0.98, hueRotate: -12 },
	}),
	lookEffect({
		type: "mw-look-neon",
		name: "Neon",
		keywords: ["neon", "cyber", "vivid"],
		channels: { saturate: 1.7, contrast: 1.25, brightness: 0.95, hueRotate: 35 },
	}),
	lookEffect({
		type: "mw-look-faded",
		name: "Faded",
		keywords: ["faded", "pastel", "matte"],
		channels: { contrast: 0.82, saturate: 0.78, brightness: 1.12, sepia: 0.12 },
	}),
];
