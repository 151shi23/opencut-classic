import type { MaskableElement, VisualElement } from "./types";
import type { ParamValues } from "@/params";
import type { ElementAnimations } from "@/animation/types";

interface BaseDragData {
	id: string;
	name: string;
}

export interface MediaDragData extends BaseDragData {
	type: "media";
	mediaType: "image" | "video" | "audio";
	targetElementTypes?: MaskableElement["type"][];
}

export interface TextDragData extends BaseDragData {
	type: "text";
	content: string;
	/** 样式预设带过来的参数覆盖；不填就是普通默认文字 */
	params?: ParamValues;
	/** 预设自带的关键帧（流光、呼吸霓虹），拖进来也要保住 */
	animations?: ElementAnimations;
}

export interface StickerDragData extends BaseDragData {
	type: "sticker";
	stickerId: string;
}

export interface GraphicDragData extends BaseDragData {
	type: "graphic";
	definitionId: string;
	params: Partial<ParamValues>;
}

export interface EffectDragData extends BaseDragData {
	type: "effect";
	effectType: string;
	targetElementTypes: VisualElement["type"][];
}

export type TimelineDragData =
	| MediaDragData
	| TextDragData
	| StickerDragData
	| GraphicDragData
	| EffectDragData;
