import { EditorCore } from "@/core";
import { Command, type CommandResult } from "@/commands/base-command";
import {
	MASK_PARAM_PATH_PREFIX,
	MASK_PARAM_PATH_SUFFIX,
} from "@/animation/mask-param-channel";
import type { ElementAnimations } from "@/animation/types";
import { isMaskableElement, updateElementInSceneTracks } from "@/timeline";
import type { SceneTracks, MaskableElement } from "@/timeline";

function removeMaskFromElement({
	element,
	maskId,
}: {
	element: MaskableElement;
	maskId: string;
}): MaskableElement {
	const currentMasks = element.masks ?? [];
	const filteredMasks = currentMasks.filter((mask) => mask.id !== maskId);
	/*
	 * 遮罩删了，它的关键帧通道必须跟着走：留着就是孤儿数据 —— 时间轴上还会占一条
	 * 泳道，而且 maskId 是建遮罩时生成的 uuid，一旦哪天复用同一个 id 就会串动画。
	 */
	const prefix = `${MASK_PARAM_PATH_PREFIX}${maskId}${MASK_PARAM_PATH_SUFFIX}`;
	const animations = element.animations
		? (Object.fromEntries(
				Object.entries(element.animations).filter(
					([path]) => !path.startsWith(prefix),
				),
			) as ElementAnimations)
		: element.animations;
	return { ...element, masks: filteredMasks, animations };
}

export class RemoveMaskCommand extends Command {
	private savedState: SceneTracks | null = null;
	private readonly trackId: string;
	private readonly elementId: string;
	private readonly maskId: string;

	constructor({
		trackId,
		elementId,
		maskId,
	}: {
		trackId: string;
		elementId: string;
		maskId: string;
	}) {
		super();
		this.trackId = trackId;
		this.elementId = elementId;
		this.maskId = maskId;
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;

		const updatedTracks = updateElementInSceneTracks({
			tracks: this.savedState,
			trackId: this.trackId,
			elementId: this.elementId,
			elementPredicate: isMaskableElement,
			update: (element) => {
				if (!isMaskableElement(element)) return element;
				return removeMaskFromElement({
					element,
					maskId: this.maskId,
				});
			},
		});

		editor.timeline.updateTracks(updatedTracks);
		return undefined;
	}

	undo(): void {
		if (this.savedState) {
			const editor = EditorCore.getInstance();
			editor.timeline.updateTracks(this.savedState);
		}
	}
}
