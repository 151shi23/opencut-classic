import type { MediaTime } from "@/wasm";
import type { ParamValue } from "@/params";

export const ANIMATION_PROPERTY_PATHS = [
	"transform.positionX",
	"transform.positionY",
	"transform.scaleX",
	"transform.scaleY",
	"transform.rotate",
	"opacity",
	"volume",
	"color",
	"background.color",
	"background.paddingX",
	"background.paddingY",
	"background.offsetX",
	"background.offsetY",
	"background.cornerRadius",
	"stroke.color",
	"shadow.color",
	// 文字面板上的排版参数：`ElementParamsTab` 用裸 key 当属性路径
	// （`element-params-tab.tsx` 里 `propertyPath: param.key`），不注册进这张表
	// 的话 `isAnimationPath()` 不认，关键帧写了也不会出现在时间轴泳道上。
	"fontSize",
	"letterSpacing",
	"lineHeight",
	// 流光花字：角度动起来，渐变就在字上扫过去
	"gradientAngle",
	"stroke.width",
	"shadow.blur",
	"shadow.offsetX",
	"shadow.offsetY",
] as const;

export type AnimationPropertyPath = (typeof ANIMATION_PROPERTY_PATHS)[number];
export type GraphicParamPath = `params.${string}`;
export type EffectParamPath = `effects.${string}.params.${string}`;
export type AnimationPath = string;

export const ANIMATION_PROPERTY_GROUPS = {
	"transform.scale": ["transform.scaleX", "transform.scaleY"],
} as const satisfies Record<string, ReadonlyArray<AnimationPropertyPath>>;

export type AnimationPropertyGroup = keyof typeof ANIMATION_PROPERTY_GROUPS;

export type DiscreteValue = boolean | string;

export interface NumericSpec {
	min?: number;
	max?: number;
	step?: number;
}
export type AnimationColorPropertyPath = Extract<
	AnimationPropertyPath,
	"color" | "background.color" | "stroke.color" | "shadow.color"
>;
export type AnimationNumericPropertyPath = Exclude<
	AnimationPropertyPath,
	AnimationColorPropertyPath
>;

export type ContinuousKeyframeInterpolation = "linear" | "hold" | "bezier";
export type DiscreteKeyframeInterpolation = "hold";
export type AnimationInterpolation =
	| ContinuousKeyframeInterpolation
	| DiscreteKeyframeInterpolation;

export type ScalarSegmentType = "step" | "linear" | "bezier";
export type TangentMode = "auto" | "aligned" | "broken" | "flat";
export type ChannelExtrapolationMode = "hold" | "linear";

export interface CurveHandle {
	dt: MediaTime;
	dv: number;
}

interface BaseAnimationKeyframe<TValue extends ParamValue> {
	id: string;
	time: MediaTime; // relative to element start time
	value: TValue;
}

export interface ScalarAnimationKey extends BaseAnimationKeyframe<number> {
	leftHandle?: CurveHandle;
	rightHandle?: CurveHandle;
	segmentToNext: ScalarSegmentType;
	tangentMode: TangentMode;
}

export type DiscreteAnimationKey = BaseAnimationKeyframe<DiscreteValue>;

export type Keyframe<TValue extends ParamValue = ParamValue> =
	TValue extends number
		? ScalarAnimationKey
		: TValue extends DiscreteValue
			? DiscreteAnimationKey
			: never;

export interface ScalarChannel {
	keys: ScalarAnimationKey[];
	extrapolation?: {
		before: ChannelExtrapolationMode;
		after: ChannelExtrapolationMode;
	};
}

export interface DiscreteChannel {
	keys: DiscreteAnimationKey[];
}

export type Channel<TValue extends ParamValue = ParamValue> =
	TValue extends number
		? ScalarChannel
		: TValue extends DiscreteValue
			? DiscreteChannel
			: never;

export type ScalarAnimationChannel = Channel<number>;
export type DiscreteAnimationChannel = Channel<DiscreteValue>;
export type AnimationChannel = Channel;

export type CompositeChannelData = Record<string, AnimationChannel | undefined>;
export type ChannelData = AnimationChannel | CompositeChannelData;

export interface ElementAnimations {
	[propertyPath: AnimationPath]: ChannelData | undefined;
}

export type NormalizedCubicBezier = [number, number, number, number];

export interface ScalarGraphChannelTarget {
	propertyPath: AnimationPath;
	componentKey: string;
}

export interface ScalarGraphChannel extends ScalarGraphChannelTarget {
	channel: ScalarAnimationChannel;
}

export interface ScalarGraphKeyframeRef extends ScalarGraphChannelTarget {
	keyframeId: string;
}

export interface ScalarGraphKeyframeContext extends ScalarGraphChannel {
	keyframe: ScalarAnimationKey;
	keyframeIndex: number;
	previousKey: ScalarAnimationKey | null;
	nextKey: ScalarAnimationKey | null;
}

export interface ScalarCurveKeyframePatch {
	leftHandle?: CurveHandle | null;
	rightHandle?: CurveHandle | null;
	segmentToNext?: ScalarSegmentType;
	tangentMode?: TangentMode;
}

export interface ElementKeyframe {
	propertyPath: AnimationPath;
	id: string;
	time: MediaTime;
	value: ParamValue;
	interpolation: AnimationInterpolation;
}

export interface SelectedKeyframeRef {
	trackId: string;
	elementId: string;
	propertyPath: AnimationPath;
	keyframeId: string;
}
