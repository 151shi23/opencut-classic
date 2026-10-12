import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { useEditor } from "@/editor/use-editor";
import { DEFAULTS } from "@/timeline/defaults";
import { buildTextElement } from "@/timeline/element-utils";
import {
	TEXT_PRESETS,
	buildPresetPreviewStyle,
	type TextPreset,
} from "@/text/presets";
import type { MediaTime } from "@/wasm";

export function TextView() {
	const editor = useEditor();

	const addPreset = ({
		preset,
		currentTime,
	}: {
		preset: TextPreset;
		currentTime: MediaTime;
	}) => {
		const element = buildTextElement({
			raw: {
				...DEFAULTS.text.element,
				name: preset.label,
				params: {
					...DEFAULTS.text.element.params,
					...preset.params,
					content: preset.content,
				},
				// 招牌款自带关键帧，落进时间轴就在自己动
				animations: preset.animations,
			},
			startTime: currentTime,
		});

		editor.timeline.insertElement({
			element,
			placement: { mode: "auto" },
		});
	};

	return (
		<PanelView title="Text">
			{/*
			 * 一排卡片而不是一个"默认文字"：手机上做字幕标题，最费时间的不是打字，
			 * 是字号、描边、阴影、底条那七八个滑杆。预设一次把整套样式落进时间轴，
			 * 落进去的还是普通文字元素，参数照样能单独改、能打关键帧。
			 */}
			<div className="flex flex-wrap gap-x-2 gap-y-3">
				{TEXT_PRESETS.map((preset) => (
					<DraggableItem
						key={preset.key}
						name={preset.label}
						preview={
							<div className="bg-accent flex size-full items-center justify-center overflow-hidden rounded px-1">
								<span
									className="select-none whitespace-nowrap"
									style={buildPresetPreviewStyle({ preset })}
								>
									{preset.content}
								</span>
							</div>
						}
						dragData={{
							id: `text-preset-${preset.key}`,
							type: DEFAULTS.text.element.type,
							name: preset.label,
							content: preset.content,
							params: preset.params,
							animations: preset.animations,
						}}
						aspectRatio={1}
						onAddToTimeline={({ currentTime }) =>
							addPreset({ preset, currentTime })
						}
						shouldShowLabel
						/* 触屏无 hover：不加这行，手机上没有任何「加文字」的入口（只能拖） */
						plusAlwaysVisible
					/>
				))}
			</div>
		</PanelView>
	);
}
