"use client";

// 安卓移植新增：入场 / 出场 / 音频淡入淡出预设（剪映同款）。
// 纯关键帧数据预设：应用即写入元素动画通道，可在时间线曲线编辑器里继续微调。

import { useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { Section, SectionContent } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/utils/ui";
import { isPresetApplied } from "@/animation/presets";
import {
	AUDIO_FADE_IN,
	AUDIO_FADE_OUT,
	ENTRANCE_PRESETS,
	EXIT_PRESETS,
	LOOP_PRESETS,
	autoPresetSeconds,
	clearPresetPaths,
	maxPresetSeconds,
	mergePresetAnimations,
	PRESET_MIN_SECONDS,
	type AnimationPreset,
	type PresetContext,
	type PresetWindow,
} from "@/animation/presets";
import type { TimelineElement } from "@/timeline";

export function AnimationPresetsSection({
	element,
	trackId,
}: {
	element: TimelineElement;
	trackId: string;
}) {
	const editor = useEditor();
	const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
	const hasAudio = element.type === "video" || element.type === "audio";
	const numberParam = (key: string, fallback: number) =>
		typeof element.params[key] === "number"
			? (element.params[key] as number)
			: fallback;
	const volumeDb = numberParam("volume", 0);
	/*
	 * 循环类预设围着"元素现在的样子"转，不能凭空假设缩放 1、位置 0 ——
	 * 那样用户摆好的构图会被一口呼吸冲掉。
	 */
	const base: PresetContext["base"] = {
		positionX: numberParam("transform.positionX", 0),
		positionY: numberParam("transform.positionY", 0),
		scaleX: numberParam("transform.scaleX", 1),
		scaleY: numberParam("transform.scaleY", 1),
		rotate: numberParam("transform.rotate", 0),
		opacity: numberParam("opacity", 1),
	};
	const presetContext = (seconds: number | null): PresetContext => ({
		durationTicks: element.duration,
		volumeDb,
		base,
		...(seconds !== null ? { durationSeconds: seconds } : {}),
	});

	const apply = (preset: AnimationPreset) => {
		editor.timeline.previewElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					updates: {
						animations: mergePresetAnimations({
							existing: element.animations,
							built: preset.build(presetContext(durationSeconds)),
						}),
					},
				},
			],
		});
		editor.timeline.commitPreview();
	};

	const clear = ({
		paths,
		window,
	}: {
		paths: readonly string[];
		window?: PresetWindow;
	}) => {
		editor.timeline.previewElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					updates: {
						animations: clearPresetPaths({
							animations: element.animations,
							paths,
							window,
							durationTicks: window ? element.duration : undefined,
						}),
					},
				},
			],
		});
		editor.timeline.commitPreview();
	};

	return (
		<Section sectionKey={`${element.id}:animation`}>
			<SectionContent className="flex flex-col gap-3.5 pt-3">
				<DurationControl
					value={durationSeconds}
					autoValue={autoPresetSeconds({ durationTicks: element.duration })}
					max={maxPresetSeconds({ durationTicks: element.duration })}
					onChange={setDurationSeconds}
				/>
				<PresetGroup
					title="入场"
					caption="片段开头"
					presets={ENTRANCE_PRESETS}
					window="start"
					animations={element.animations}
					context={presetContext(null)}
					onApply={apply}
					onClear={() =>
						clear({
							paths: ENTRANCE_PRESETS.flatMap((p) => p.paths),
							window: "start",
						})
					}
				/>
				<PresetGroup
					title="出场"
					caption="片段结尾"
					presets={EXIT_PRESETS}
					window="end"
					animations={element.animations}
					context={presetContext(null)}
					onApply={apply}
					onClear={() =>
						clear({
							paths: EXIT_PRESETS.flatMap((p) => p.paths),
							window: "end",
						})
					}
				/>
				{/*
					循环组不占"开头/结尾"某一段，它靠通道的 loop 外推把一圈动画
					重复到素材结束，所以不传 window，清除时整条通道删掉。
				*/}
				<PresetGroup
					title="循环"
					caption="撑满整段"
					presets={LOOP_PRESETS}
					animations={element.animations}
					context={presetContext(null)}
					onApply={apply}
					onClear={() =>
						clear({ paths: LOOP_PRESETS.flatMap((p) => p.paths) })
					}
				/>
				{hasAudio ? (
					<PresetGroup
						title="音频"
						caption="音量斜坡"
						presets={[AUDIO_FADE_IN, AUDIO_FADE_OUT]}
						animations={element.animations}
						context={presetContext(null)}
						onApply={apply}
						onClear={() => clear({ paths: AUDIO_FADE_IN.paths })}
					/>
				) : null}
				<Button
					variant="ghost"
					size="sm"
					className="h-7 justify-center gap-1.5 text-xs text-muted-foreground"
					onClick={() =>
						clear({
							paths: [
								...ENTRANCE_PRESETS,
								...EXIT_PRESETS,
								...LOOP_PRESETS,
								AUDIO_FADE_IN,
							].flatMap((p) => p.paths),
						})
					}
				>
					<ClearIcon />
					清除全部动画
				</Button>
			</SectionContent>
		</Section>
	);
}

function DurationControl({
	value,
	autoValue,
	max,
	onChange,
}: {
	value: number | null;
	autoValue: number;
	max: number;
	onChange: (value: number | null) => void;
}) {
	const shown = value ?? autoValue;
	const custom = value !== null;
	return (
		<div className="rounded-lg border border-border/60 bg-muted/20 px-2.5 pt-2 pb-2.5">
			<div className="flex items-center gap-2">
				<span className="text-xs font-medium">动画时长</span>
				<span
					className={cn(
						"rounded px-1.5 py-0.5 text-[11px] tabular-nums",
						custom
							? "bg-primary/10 text-primary"
							: "bg-muted text-muted-foreground",
					)}
				>
					{custom
						? `${shown.toFixed(1)} 秒`
						: `自动 ${autoValue.toFixed(1)} 秒`}
				</span>
				<div className="flex-1" />
				{custom ? (
					<button
						type="button"
						onClick={() => onChange(null)}
						className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
					>
						恢复自动
					</button>
				) : null}
			</div>
			<Slider
				data-mw-anim-slider=""
				min={PRESET_MIN_SECONDS}
				max={max}
				step={0.1}
				className="mt-2.5"
				value={[Math.min(Math.max(shown, PRESET_MIN_SECONDS), max)]}
				onValueChange={([next]) => onChange(next ?? PRESET_MIN_SECONDS)}
			/>
			<p className="mt-1.5 text-[11px] text-muted-foreground/70">
				时长作用于接下来点击的预设
			</p>
		</div>
	);
}

function PresetGroup({
	title,
	caption,
	presets,
	window,
	animations,
	context,
	onApply,
	onClear,
}: {
	title: string;
	caption: string;
	presets: readonly AnimationPreset[];
	window?: PresetWindow;
	animations: TimelineElement["animations"];
	context: PresetContext;
	onApply: (preset: AnimationPreset) => void;
	onClear: () => void;
}) {
	const groupPaths = [
		...new Set(presets.flatMap((preset) => [...preset.paths])),
	];
	const activeIds = presets
		.filter((preset) =>
			isPresetApplied({
				preset,
				animations,
				window,
				groupPaths,
				context,
			}),
		)
		.map((preset) => preset.id);

	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center gap-2 px-0.5">
				<span className="text-xs font-medium">{title}</span>
				<span
					data-mw-anim-caption=""
					className="text-[11px] text-muted-foreground/70"
				>
					{caption}
				</span>
				<span className="h-px flex-1 bg-border/60" />
				{activeIds.length > 0 ? (
					<button
						type="button"
						onClick={onClear}
						className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
					>
						<ClearIcon />
						清除
					</button>
				) : null}
			</div>
			<div className="grid grid-cols-2 gap-1.5">
				{presets.map((preset) => (
					<PresetTile
						key={preset.id}
						preset={preset}
						active={activeIds.includes(preset.id)}
						onClick={() => onApply(preset)}
					/>
				))}
			</div>
		</div>
	);
}

function PresetTile({
	preset,
	active,
	onClick,
}: {
	preset: AnimationPreset;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			data-mw-anim-tile=""
			aria-pressed={active}
			onClick={onClick}
			className={cn(
				"flex items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors",
				active
					? "border-primary/60 bg-primary/10 text-foreground ring-1 ring-primary/20"
					: "border-border/60 text-muted-foreground hover:border-border hover:bg-secondary/60 hover:text-foreground",
			)}
		>
			<PresetGlyph
				id={preset.id}
				className={active ? "text-primary" : undefined}
			/>
			<span className="min-w-0 flex-1 truncate text-xs font-medium">
				{preset.label}
			</span>
			{active ? <CheckIcon /> : null}
		</button>
	);
}

// --- 图标：把每个预设的运动方向画出来，触屏上也认得出 ---------------------

function PresetGlyph({ id, className }: { id: string; className?: string }) {
	return (
		<svg
			viewBox="0 0 16 16"
			className={cn("size-4 shrink-0", className)}
			aria-hidden="true"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.4"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<GlyphBody id={id} />
		</svg>
	);
}

function GlyphBody({ id }: { id: string }) {
	switch (id) {
		case "fade-in":
			return (
				<>
					<circle cx="4.6" cy="8" r="2.6" fill="currentColor" opacity="0.25" />
					<circle cx="11.4" cy="8" r="2.6" fill="currentColor" opacity="0.9" />
				</>
			);
		case "fade-out":
			return (
				<>
					<circle cx="4.6" cy="8" r="2.6" fill="currentColor" opacity="0.9" />
					<circle cx="11.4" cy="8" r="2.6" fill="currentColor" opacity="0.25" />
				</>
			);
		case "fly-up":
			return (
				<>
					<path d="M8 11.4V4.6" />
					<path d="M4.9 7.5 8 4.4l3.1 3.1" />
					<path d="M3 13.4h10" opacity="0.4" />
				</>
			);
		case "fly-down-out":
			return (
				<>
					<path d="M3 2.6h10" opacity="0.4" />
					<path d="M8 4.6v6.8" />
					<path d="M4.9 8.5 8 11.6l3.1-3.1" />
				</>
			);
		case "fly-left":
			return (
				<>
					<path d="M11.4 8H4.6" />
					<path d="M7.5 4.9 4.4 8l3.1 3.1" />
					<path d="M13.4 3v10" opacity="0.4" />
				</>
			);
		case "fly-right-out":
			return (
				<>
					<path d="M2.6 3v10" opacity="0.4" />
					<path d="M4.6 8h6.8" />
					<path d="M8.5 4.9 11.6 8l-3.1 3.1" />
				</>
			);
		case "zoom-pop":
			return (
				<>
					<path d="M2.8 6V2.8H6" />
					<path d="M13.2 10v3.2H10" />
					<rect
						x="5.6"
						y="5.6"
						width="4.8"
						height="4.8"
						rx="1"
						opacity="0.45"
					/>
				</>
			);
		case "zoom-out":
			return (
				<>
					<path d="M6 2.8H2.8V6" />
					<path d="M10 13.2h3.2V10" />
					<rect
						x="5.6"
						y="5.6"
						width="4.8"
						height="4.8"
						rx="1"
						opacity="0.45"
					/>
				</>
			);
		case "bounce":
			return (
				<>
					<path d="M2.6 13.2h10.8" opacity="0.4" />
					<path
						d="M2.9 12.3C5.1 5.2 10.9 5.2 13.1 12.3"
						strokeDasharray="2 2"
						opacity="0.5"
					/>
					<circle cx="8" cy="5.6" r="2.1" fill="currentColor" />
				</>
			);
		case "audio-fade-in":
			return (
				<>
					<path
						d="M2.8 12.4 13.2 4.6v7.8Z"
						fill="currentColor"
						opacity="0.15"
					/>
					<path d="M2.8 12.4 13.2 4.6" />
					<path d="M2.8 12.4h10.4" opacity="0.4" />
				</>
			);
		case "audio-fade-out":
			return (
				<>
					<path
						d="M2.8 4.6 13.2 12.4H2.8Z"
						fill="currentColor"
						opacity="0.15"
					/>
					<path d="M2.8 4.6 13.2 12.4" />
					<path d="M2.8 12.4h10.4" opacity="0.4" />
				</>
			);
		case "loop-breathe":
			return (
				<>
					<circle cx="8" cy="8" r="2.4" fill="currentColor" />
					<circle
						cx="8"
						cy="8"
						r="5.4"
						strokeDasharray="2 2"
						opacity="0.55"
					/>
				</>
			);
		case "loop-sway":
			return (
				<>
					<path d="M3.2 8c1.6-2.6 8-2.6 9.6 0" />
					<path d="M4.6 6.2 3 8l1.9 1.4" />
					<path d="M11.4 9.8 13 8l-1.9-1.4" opacity="0.6" />
				</>
			);
		case "loop-spin":
			return (
				<>
					<path d="M13 8a5 5 0 1 1-1.7-3.75" />
					<path d="M13.2 2.9v2.3h-2.3" />
				</>
			);
		case "loop-blink":
			return (
				<>
					<circle cx="5.4" cy="8" r="2.6" fill="currentColor" />
					<circle cx="11.2" cy="8" r="2.6" fill="currentColor" opacity="0.2" />
				</>
			);
		default:
			return <circle cx="8" cy="8" r="4.4" opacity="0.5" />;
	}
}

function CheckIcon() {
	return (
		<svg
			viewBox="0 0 16 16"
			className="mw-anim-check size-3.5 shrink-0 text-primary"
			aria-hidden="true"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M3.6 8.5 6.3 11.2 12.4 4.9" />
		</svg>
	);
}

function ClearIcon() {
	return (
		<svg
			viewBox="0 0 16 16"
			className="size-3 shrink-0"
			aria-hidden="true"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
		>
			<path d="M4.3 4.3l7.4 7.4M11.7 4.3l-7.4 7.4" />
		</svg>
	);
}
