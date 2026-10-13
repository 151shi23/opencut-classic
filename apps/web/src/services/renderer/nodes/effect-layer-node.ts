import type { EffectPass } from "@/effects/types";
import type { ParamValues } from "@/params";
import type { ElementAnimations } from "@/animation/types";
import { BaseNode } from "./base-node";

export type EffectLayerNodeParams = {
	effectType: string;
	/** 独立特效元素自己的 id —— 关键帧路径 `effects.<effectId>.params.<key>` 用它拼 */
	effectId: string;
	effectParams: ParamValues;
	animations?: ElementAnimations;
	timeOffset: number;
	duration: number;
};

export type ResolvedEffectLayerNodeState = {
	passes: EffectPass[];
};

export class EffectLayerNode extends BaseNode<
	EffectLayerNodeParams,
	ResolvedEffectLayerNodeState
> {}
