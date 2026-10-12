import { CORNER_RADIUS_MIN } from "@/text/background";
import { DEFAULTS } from "@/timeline/defaults";
import type { TextElement } from "@/timeline";
import type { TextBackground } from "@/text/background";
import { resolveNumberAtTime } from "@/animation/values";
import type { AnimationNumericPropertyPath } from "@/animation/types";
import {
	getTextVisualRect,
} from "./layout";
import {
	measureTextLayout,
	type MeasuredTextLayout,
	type TextAlign,
	type TextDecoration,
	type TextFontStyle,
	type TextFontWeight,
	type TextLayoutParams,
} from "./primitives";

export interface ResolvedTextBackground extends TextBackground {
	paddingX: number;
	paddingY: number;
	offsetX: number;
	offsetY: number;
	cornerRadius: number;
}

export interface MeasuredTextElement extends MeasuredTextLayout {
	resolvedBackground: ResolvedTextBackground;
	visualRect: { left: number; top: number; width: number; height: number };
}

let textMeasurementContext:
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D
	| null = null;

export function getTextMeasurementContext():
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D {
	if (textMeasurementContext) {
		return textMeasurementContext;
	}

	if (typeof OffscreenCanvas !== "undefined") {
		const canvas = new OffscreenCanvas(1, 1);
		const context = canvas.getContext("2d");
		if (context) {
			textMeasurementContext = context;
			return context;
		}
	}

	if (typeof document !== "undefined") {
		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d");
		if (context) {
			textMeasurementContext = context;
			return context;
		}
	}

	throw new Error("Failed to create text measurement context");
}

export function measureTextElement({
	element,
	canvasHeight,
	canvasWidth,
	localTime,
	ctx,
}: {
	element: TextElement;
	canvasHeight: number;
	/** 画布宽度：设了「文字框宽」才用得上，用来把百分比换成像素 */
	canvasWidth?: number;
	localTime: number;
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}): MeasuredTextElement {
	// localTime 往下传：字号 / 字间距 / 行高都是会影响排版的关键帧属性
	const text = buildTextLayoutParamsFromElement({ element, localTime });
	const measuredLayout = measureTextLayout({
		text,
		canvasHeight,
		canvasWidth,
		ctx,
	});

	const bg = buildTextBackgroundFromElement({ element });
	const resolvedBackground: ResolvedTextBackground = {
		...bg,
		paddingX: resolveNumberAtTime({
			baseValue: bg.paddingX ?? DEFAULTS.text.background.paddingX,
			animations: element.animations,
			propertyPath: "background.paddingX",
			localTime,
		}),
		paddingY: resolveNumberAtTime({
			baseValue: bg.paddingY ?? DEFAULTS.text.background.paddingY,
			animations: element.animations,
			propertyPath: "background.paddingY",
			localTime,
		}),
		offsetX: resolveNumberAtTime({
			baseValue: bg.offsetX ?? DEFAULTS.text.background.offsetX,
			animations: element.animations,
			propertyPath: "background.offsetX",
			localTime,
		}),
		offsetY: resolveNumberAtTime({
			baseValue: bg.offsetY ?? DEFAULTS.text.background.offsetY,
			animations: element.animations,
			propertyPath: "background.offsetY",
			localTime,
		}),
		cornerRadius: resolveNumberAtTime({
			baseValue: bg.cornerRadius ?? CORNER_RADIUS_MIN,
			animations: element.animations,
			propertyPath: "background.cornerRadius",
			localTime,
		}),
	};

	const visualRect = getTextVisualRect({
		textAlign: text.textAlign,
		block: measuredLayout.block,
		background: resolvedBackground,
		fontSizeRatio: measuredLayout.fontSizeRatio,
	});

	return {
		...measuredLayout,
		resolvedBackground,
		visualRect,
	};
}

type TextLayoutNumberPath = Extract<
	AnimationNumericPropertyPath,
	"fontSize" | "letterSpacing" | "lineHeight"
>;

/**
 * 读一个"可能被关键帧驱动"的数值参数。
 *
 * 路径是**裸 key**（`fontSize`），和写入侧一致：文字面板走 `ElementParamsTab`，
 * 它给 `useKeyframedParamProperty` 传的就是 `propertyPath: param.key`
 * （`components/editor/panels/properties/components/element-params-tab.tsx:87`）。
 * 只有 graphic 元素才用 `params.<key>` 前缀。以前这里静态读 `element.params`，
 * 于是字号/字间距/行高**能开关键帧、画面却一动不动**。
 *
 * 不传 `localTime` 就是"要基准值"：文字编辑浮层改的是参数本身，那里必须显示与编辑
 * 未参与动画插值的原值，不能被某一帧的插值结果顶掉。
 */
function readAnimatedNumberParam({
	element,
	key,
	fallback,
	localTime,
}: {
	element: TextElement;
	key: TextLayoutNumberPath;
	fallback: number;
	localTime?: number;
}): number {
	const base = readNumberParam({ params: element.params, key, fallback });
	if (localTime === undefined) {
		return base;
	}
	return resolveNumberAtTime({
		baseValue: base,
		animations: element.animations,
		propertyPath: key,
		localTime,
	});
}

export function buildTextLayoutParamsFromElement({
	element,
	localTime,
}: {
	element: TextElement;
	/** 元素内时间；给了才会去采样 `params.*` 关键帧 */
	localTime?: number;
}): TextLayoutParams {
	return {
		content: readStringParam({
			params: element.params,
			key: "content",
			fallback: "Default text",
		}),
		fontSize: readAnimatedNumberParam({
			element,
			key: "fontSize",
			fallback: 15,
			localTime,
		}),
		fontFamily: readStringParam({
			params: element.params,
			key: "fontFamily",
			fallback: "Arial",
		}),
		fontWeight: readFontWeight({
			value: element.params.fontWeight,
			fallback: "normal",
		}),
		fontStyle: readFontStyle({
			value: element.params.fontStyle,
			fallback: "normal",
		}),
		textAlign: readTextAlign({
			value: element.params.textAlign,
			fallback: "center",
		}),
		textDecoration: readTextDecoration({
			value: element.params.textDecoration,
			fallback: "none",
		}),
		letterSpacing: readAnimatedNumberParam({
			element,
			key: "letterSpacing",
			fallback: DEFAULTS.text.letterSpacing,
			localTime,
		}),
		lineHeight: readAnimatedNumberParam({
			element,
			key: "lineHeight",
			fallback: DEFAULTS.text.lineHeight,
			localTime,
		}),
		maxWidth: readNumberParam({
			params: element.params,
			key: "maxWidth",
			fallback: 0,
		}),
	};
}

export function buildTextBackgroundFromElement({
	element,
}: {
	element: TextElement;
}): TextBackground {
	return {
		enabled: readBooleanParam({
			params: element.params,
			key: "background.enabled",
			fallback: DEFAULTS.text.background.enabled,
		}),
		color: readStringParam({
			params: element.params,
			key: "background.color",
			fallback: DEFAULTS.text.background.color,
		}),
		cornerRadius: readNumberParam({
			params: element.params,
			key: "background.cornerRadius",
			fallback: DEFAULTS.text.background.cornerRadius,
		}),
		paddingX: readNumberParam({
			params: element.params,
			key: "background.paddingX",
			fallback: DEFAULTS.text.background.paddingX,
		}),
		paddingY: readNumberParam({
			params: element.params,
			key: "background.paddingY",
			fallback: DEFAULTS.text.background.paddingY,
		}),
		offsetX: readNumberParam({
			params: element.params,
			key: "background.offsetX",
			fallback: DEFAULTS.text.background.offsetX,
		}),
		offsetY: readNumberParam({
			params: element.params,
			key: "background.offsetY",
			fallback: DEFAULTS.text.background.offsetY,
		}),
	};
}

function readStringParam({
	params,
	key,
	fallback,
}: {
	params: TextElement["params"];
	key: string;
	fallback: string;
}): string {
	const value = params[key];
	return typeof value === "string" ? value : fallback;
}

function readNumberParam({
	params,
	key,
	fallback,
}: {
	params: TextElement["params"];
	key: string;
	fallback: number;
}): number {
	const value = params[key];
	return typeof value === "number" ? value : fallback;
}

function readBooleanParam({
	params,
	key,
	fallback,
}: {
	params: TextElement["params"];
	key: string;
	fallback: boolean;
}): boolean {
	const value = params[key];
	return typeof value === "boolean" ? value : fallback;
}

function readTextAlign({
	value,
	fallback,
}: {
	value: unknown;
	fallback: TextAlign;
}): TextAlign {
	return value === "left" || value === "center" || value === "right"
		? value
		: fallback;
}

function readFontWeight({
	value,
	fallback,
}: {
	value: unknown;
	fallback: TextFontWeight;
}): TextFontWeight {
	return value === "bold" || value === "normal" ? value : fallback;
}

function readFontStyle({
	value,
	fallback,
}: {
	value: unknown;
	fallback: TextFontStyle;
}): TextFontStyle {
	return value === "italic" || value === "normal" ? value : fallback;
}

function readTextDecoration({
	value,
	fallback,
}: {
	value: unknown;
	fallback: TextDecoration;
}): TextDecoration {
	return value === "none" || value === "underline" || value === "line-through"
		? value
		: fallback;
}
