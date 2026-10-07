import { nanoid } from "nanoid";
import type {
	ChannelData,
	ElementAnimations,
	ScalarAnimationKey,
	ScalarChannel,
} from "./types";
import { TICKS_PER_SECOND, type MediaTime } from "@/wasm";

/**
 * 安卓移植新增：入场 / 出场动画预设（剪映同款玩法）。
 * 纯数据层 —— 把预设编译成关键帧通道，渲染端用现成的关键帧引擎采样，零引擎改动。
 *
 * 时间约定：关键帧 time 相对元素起点（ticks）；入场从 0 开始，出场贴元素结尾。
 * 入场、出场各写各的关键帧，可以共存；时长可由用户指定，缺省按元素时长的比例自动收拢。
 */

export interface AnimationPreset {
	id: string;
	label: string;
	/** 该预设会写（清除时要删）的属性路径。 */
	paths: readonly string[];
	build: (context: PresetContext) => ElementAnimations;
}

export interface PresetContext {
	/** 元素总时长（ticks）。 */
	durationTicks: number;
	/** 元素当前音量（dB），音频淡入淡出用它当目标值。 */
	volumeDb: number;
	/** 用户指定的动画时长（秒）；不传则按元素时长自动收拢。 */
	durationSeconds?: number;
}

const MAX_PRESET_SECONDS = 0.6;
const MIN_PRESET_SECONDS = 0.05;
const MAX_CUSTOM_SECONDS = 3;

/** 时长滑块的下限。 */
export const PRESET_MIN_SECONDS = 0.1;

/** 滑块上限：自定义时长不能超过片段本身。 */
export function maxPresetSeconds({
	durationTicks,
}: {
	durationTicks: number;
}): number {
	return clamp(
		durationTicks / TICKS_PER_SECOND,
		PRESET_MIN_SECONDS,
		MAX_CUSTOM_SECONDS,
	);
}

function presetSeconds({
	durationTicks,
	durationSeconds,
}: Pick<PresetContext, "durationTicks" | "durationSeconds">): number {
	const clipSeconds = durationTicks / TICKS_PER_SECOND;
	if (durationSeconds !== undefined) {
		// 自定义时长不能超过片段本身，否则首尾关键帧会重叠、动画失去意义。
		return clamp(
			durationSeconds,
			MIN_PRESET_SECONDS,
			Math.max(clipSeconds, MIN_PRESET_SECONDS),
		);
	}
	return clamp(clipSeconds * 0.25, 0.1, MAX_PRESET_SECONDS);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

/** 「自动」时长：不指定时预设实际会用的秒数，给 UI 回显用。 */
export function autoPresetSeconds({
	durationTicks,
}: {
	durationTicks: number;
}): number {
	return presetSeconds({ durationTicks });
}

function key({
	timeTicks,
	value,
	segmentToNext = "linear",
}: {
	timeTicks: number;
	value: number;
	segmentToNext?: ScalarAnimationKey["segmentToNext"];
}): ScalarAnimationKey {
	return {
		id: nanoid(),
		time: Math.round(timeTicks) as MediaTime,
		value,
		segmentToNext,
		tangentMode: "auto",
	};
}

function scalarChannel(keys: ScalarAnimationKey[]): ScalarChannel {
	return { keys };
}

/** 预设编译成动画通道（写出该预设自己的关键帧，合并到已有动画由 mergePresetAnimations 负责）。 */
function buildChannels({
	paths,
	keys,
	existing,
}: {
	paths: readonly string[];
	keys: Record<string, ScalarAnimationKey[]>;
	existing?: ElementAnimations | undefined;
}): ElementAnimations {
	const next: ElementAnimations = { ...(existing ?? {}) };
	for (const path of paths) {
		const channelKeys = keys[path];
		next[path] =
			channelKeys && channelKeys.length > 0 ? { keys: channelKeys } : undefined;
	}
	return next;
}

// ---------------------------------------------------------------- 共存与清除

/**
 * 关键帧归属的时间窗：入场占用片段开头一段，出场占用结尾一段，
 * 音频淡入淡出同理。这样同一属性（如 opacity）能同时挂上入场和出场。
 */
export type PresetWindow = "start" | "end";

function scalarKeysOf(
	channel: ChannelData | undefined,
): ScalarAnimationKey[] | undefined {
	const keys = (channel as ScalarChannel | undefined)?.keys;
	return Array.isArray(keys) ? keys : undefined;
}

/**
 * 把新预设的关键帧合并进元素已有动画：只替换本次预设关键帧所占区间内的旧关键帧，
 * 区间外（即另一组入场/出场）的关键帧原样保留 —— 入场 + 出场因此可以共存。
 */
export function mergePresetAnimations({
	existing,
	built,
}: {
	existing: ElementAnimations | undefined;
	built: ElementAnimations;
}): ElementAnimations {
	const next: ElementAnimations = { ...(existing ?? {}) };
	for (const [path, builtChannel] of Object.entries(built)) {
		const builtKeys = scalarKeysOf(builtChannel);
		if (!builtKeys || builtKeys.length === 0) continue;

		const times = builtKeys.map((item) => Number(item.time));
		const from = Math.min(...times);
		const to = Math.max(...times);
		const existingKeys = scalarKeysOf(next[path]);
		const kept = (existingKeys ?? []).filter(
			(item) => Number(item.time) < from - 1 || Number(item.time) > to + 1,
		);
		next[path] = {
			...(existingKeys ? (next[path] as ScalarChannel) : undefined),
			keys: [...kept, ...builtKeys].sort(
				(a, b) => Number(a.time) - Number(b.time),
			),
		};
	}
	return next;
}

// ---------------------------------------------------------------- 入场

export const ENTRANCE_PRESETS: AnimationPreset[] = [
	{
		id: "fade-in",
		label: "淡入",
		paths: ["opacity"],
		build: ({ durationTicks, durationSeconds }) => {
			const d = presetSeconds({ durationTicks, durationSeconds });
			return buildChannels({
				paths: ["opacity"],
				keys: {
					opacity: [
						key({ timeTicks: 0, value: 0 }),
						key({ timeTicks: d * TICKS_PER_SECOND, value: 1 }),
					],
				},
			});
		},
	},
	{
		id: "fly-up",
		label: "向上飞入",
		paths: ["opacity", "transform.positionY"],
		build: ({ durationTicks, durationSeconds }) => {
			const d = presetSeconds({ durationTicks, durationSeconds });
			const t = d * TICKS_PER_SECOND;
			return buildChannels({
				paths: ["opacity", "transform.positionY"],
				keys: {
					opacity: [
						key({ timeTicks: 0, value: 0 }),
						key({ timeTicks: t, value: 1 }),
					],
					"transform.positionY": [
						key({ timeTicks: 0, value: 120 }),
						key({ timeTicks: t, value: 0 }),
					],
				},
			});
		},
	},
	{
		id: "fly-left",
		label: "向左飞入",
		paths: ["opacity", "transform.positionX"],
		build: ({ durationTicks, durationSeconds }) => {
			const d = presetSeconds({ durationTicks, durationSeconds });
			const t = d * TICKS_PER_SECOND;
			return buildChannels({
				paths: ["opacity", "transform.positionX"],
				keys: {
					opacity: [
						key({ timeTicks: 0, value: 0 }),
						key({ timeTicks: t, value: 1 }),
					],
					"transform.positionX": [
						key({ timeTicks: 0, value: 200 }),
						key({ timeTicks: t, value: 0 }),
					],
				},
			});
		},
	},
	{
		id: "zoom-pop",
		label: "缩放弹出",
		paths: ["opacity", "transform.scaleX", "transform.scaleY"],
		build: ({ durationTicks, durationSeconds }) => {
			const d = presetSeconds({ durationTicks, durationSeconds });
			const t = d * TICKS_PER_SECOND;
			return buildChannels({
				paths: ["opacity", "transform.scaleX", "transform.scaleY"],
				keys: {
					opacity: [
						key({ timeTicks: 0, value: 0 }),
						key({ timeTicks: t, value: 1 }),
					],
					"transform.scaleX": [
						key({ timeTicks: 0, value: 0.4 }),
						key({ timeTicks: t, value: 1 }),
					],
					"transform.scaleY": [
						key({ timeTicks: 0, value: 0.4 }),
						key({ timeTicks: t, value: 1 }),
					],
				},
			});
		},
	},
	{
		id: "bounce",
		label: "弹跳",
		paths: ["opacity", "transform.scaleX", "transform.scaleY"],
		build: ({ durationTicks, durationSeconds }) => {
			const d = presetSeconds({ durationTicks, durationSeconds });
			const t = d * TICKS_PER_SECOND;
			return buildChannels({
				paths: ["opacity", "transform.scaleX", "transform.scaleY"],
				keys: {
					opacity: [
						key({ timeTicks: 0, value: 0 }),
						key({ timeTicks: t * 0.5, value: 1 }),
					],
					"transform.scaleX": [
						key({ timeTicks: 0, value: 0.5 }),
						key({ timeTicks: t * 0.6, value: 1.15, segmentToNext: "linear" }),
						key({ timeTicks: t * 0.8, value: 0.92 }),
						key({ timeTicks: t, value: 1 }),
					],
					"transform.scaleY": [
						key({ timeTicks: 0, value: 0.5 }),
						key({ timeTicks: t * 0.6, value: 1.15, segmentToNext: "linear" }),
						key({ timeTicks: t * 0.8, value: 0.92 }),
						key({ timeTicks: t, value: 1 }),
					],
				},
			});
		},
	},
];

// ---------------------------------------------------------------- 出场

export const EXIT_PRESETS: AnimationPreset[] = [
	{
		id: "fade-out",
		label: "淡出",
		paths: ["opacity"],
		build: ({ durationTicks, durationSeconds }) => {
			const d = presetSeconds({ durationTicks, durationSeconds });
			const end = durationTicks;
			const start = end - d * TICKS_PER_SECOND;
			return buildChannels({
				paths: ["opacity"],
				keys: {
					opacity: [
						key({ timeTicks: start, value: 1 }),
						key({ timeTicks: end, value: 0 }),
					],
				},
			});
		},
	},
	{
		id: "fly-down-out",
		label: "向下飞出",
		paths: ["opacity", "transform.positionY"],
		build: ({ durationTicks, durationSeconds }) => {
			const d = presetSeconds({ durationTicks, durationSeconds });
			const end = durationTicks;
			const start = end - d * TICKS_PER_SECOND;
			return buildChannels({
				paths: ["opacity", "transform.positionY"],
				keys: {
					opacity: [
						key({ timeTicks: start, value: 1 }),
						key({ timeTicks: end, value: 0 }),
					],
					"transform.positionY": [
						key({ timeTicks: start, value: 0 }),
						key({ timeTicks: end, value: 120 }),
					],
				},
			});
		},
	},
	{
		id: "fly-right-out",
		label: "向右飞出",
		paths: ["opacity", "transform.positionX"],
		build: ({ durationTicks, durationSeconds }) => {
			const d = presetSeconds({ durationTicks, durationSeconds });
			const end = durationTicks;
			const start = end - d * TICKS_PER_SECOND;
			return buildChannels({
				paths: ["opacity", "transform.positionX"],
				keys: {
					opacity: [
						key({ timeTicks: start, value: 1 }),
						key({ timeTicks: end, value: 0 }),
					],
					"transform.positionX": [
						key({ timeTicks: start, value: 0 }),
						key({ timeTicks: end, value: 200 }),
					],
				},
			});
		},
	},
	{
		id: "zoom-out",
		label: "缩放消失",
		paths: ["opacity", "transform.scaleX", "transform.scaleY"],
		build: ({ durationTicks, durationSeconds }) => {
			const d = presetSeconds({ durationTicks, durationSeconds });
			const end = durationTicks;
			const start = end - d * TICKS_PER_SECOND;
			return buildChannels({
				paths: ["opacity", "transform.scaleX", "transform.scaleY"],
				keys: {
					opacity: [
						key({ timeTicks: start, value: 1 }),
						key({ timeTicks: end, value: 0 }),
					],
					"transform.scaleX": [
						key({ timeTicks: start, value: 1 }),
						key({ timeTicks: end, value: 0.4 }),
					],
					"transform.scaleY": [
						key({ timeTicks: start, value: 1 }),
						key({ timeTicks: end, value: 0.4 }),
					],
				},
			});
		},
	},
];

// ---------------------------------------------------------------- 音频淡入淡出（dB）

const VOLUME_PATHS = ["volume"] as const;

function audioFadeSeconds({
	durationTicks,
	durationSeconds,
}: Pick<PresetContext, "durationTicks" | "durationSeconds">): number {
	const clipSeconds = durationTicks / TICKS_PER_SECOND;
	if (durationSeconds !== undefined) {
		return presetSeconds({ durationTicks, durationSeconds });
	}
	return clamp(clipSeconds * 0.2, 0.2, 1.5);
}

export const AUDIO_FADE_IN: AnimationPreset = {
	id: "audio-fade-in",
	label: "音频淡入",
	paths: VOLUME_PATHS,
	build: ({ durationTicks, volumeDb, durationSeconds }) => {
		const d = audioFadeSeconds({ durationTicks, durationSeconds });
		return buildChannels({
			paths: VOLUME_PATHS,
			keys: {
				volume: [
					key({ timeTicks: 0, value: Math.min(volumeDb, -60) }),
					key({ timeTicks: d * TICKS_PER_SECOND, value: volumeDb }),
				],
			},
		});
	},
};

export const AUDIO_FADE_OUT: AnimationPreset = {
	id: "audio-fade-out",
	label: "音频淡出",
	paths: VOLUME_PATHS,
	build: ({ durationTicks, volumeDb, durationSeconds }) => {
		const d = audioFadeSeconds({ durationTicks, durationSeconds });
		const end = durationTicks;
		const start = end - d * TICKS_PER_SECOND;
		return buildChannels({
			paths: VOLUME_PATHS,
			keys: {
				volume: [
					key({ timeTicks: start, value: volumeDb }),
					key({ timeTicks: end, value: Math.min(volumeDb, -60) }),
				],
			},
		});
	},
};

/**
 * 清除预设。
 * 不传 window：整条属性动画删掉（"清除全部动画"、音频组用这个）。
 * 传 window：只删片段前半段（入场）或后半段（出场）的关键帧，另一组保留。
 */
export function clearPresetPaths({
	animations,
	paths,
	window,
	durationTicks,
}: {
	animations: ElementAnimations | undefined;
	paths: readonly string[];
	window?: PresetWindow;
	durationTicks?: number;
}): ElementAnimations {
	const next: ElementAnimations = { ...(animations ?? {}) };
	for (const path of paths) {
		const channel = next[path];
		const keys = scalarKeysOf(channel);
		const boundary = (durationTicks ?? 0) / 2;
		const kept =
			!window || !keys
				? []
				: keys.filter((item) => {
						const time = Number(item.time);
						return window === "start"
							? time > boundary + 1
							: time < boundary - 1;
					});
		if (kept.length === 0) delete next[path];
		else next[path] = { ...(channel as ScalarChannel), keys: kept };
	}
	return next;
}

/**
 * 当前动画是不是这个预设生成的 —— 给预设选择块画选中态用。
 *
 * 只比对「关键帧数量 + 数值序列」，不比对时间：时间随动画时长变化，
 * 用户拖动时长滑块后选中态不该跟着丢。范围限定在本组的属性路径并集内，
 * 入场/出场/音频三组互不干扰；同组内谁的通道组合对不上就不算选中。
 */
export function isPresetApplied({
	preset,
	animations,
	window,
	groupPaths,
	context,
}: {
	preset: AnimationPreset;
	animations: ElementAnimations | undefined;
	window?: PresetWindow;
	groupPaths: readonly string[];
	context: { durationTicks: number; volumeDb: number };
}): boolean {
	const built = preset.build(context);
	const boundary = context.durationTicks / 2;
	const inWindow = (keys: ScalarAnimationKey[]) =>
		!window
			? keys
			: keys.filter((item) =>
					window === "start"
						? Number(item.time) <= boundary + 1
						: Number(item.time) >= boundary - 1,
				);

	const expected = new Map<string, string>();
	for (const path of preset.paths) {
		const keys = scalarKeysOf(built[path]);
		if (!keys || keys.length === 0) return false;
		expected.set(path, valueSignature(keys));
	}

	const actual = new Map<string, string>();
	for (const path of groupPaths) {
		const keys = inWindow(scalarKeysOf(animations?.[path]) ?? []);
		if (keys.length > 0) actual.set(path, valueSignature(keys));
	}

	if (actual.size !== expected.size) return false;
	for (const [path, signature] of expected) {
		if (actual.get(path) !== signature) return false;
	}
	return true;
}

function valueSignature(keys: ScalarAnimationKey[]): string {
	return keys.map((item) => Math.round(Number(item.value) * 1000)).join(",");
}
