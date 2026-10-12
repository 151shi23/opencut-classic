import type { TextCanvasContext, TextBlockMeasurement } from "@/text/layout";
import { DEFAULTS } from "@/timeline/defaults";
import { clamp } from "@/utils/math";
import { CORNER_RADIUS_MAX, CORNER_RADIUS_MIN } from "./background";
import {
	drawTextDecoration,
	getTextBackgroundRect,
	measureTextBlock,
	setCanvasLetterSpacing,
} from "./layout";
import { FONT_SIZE_SCALE_REFERENCE } from "./typography";
import { wrapTextContent } from "./wrap";

export type TextAlign = "left" | "center" | "right";
export type TextFontWeight = "normal" | "bold";
export type TextFontStyle = "normal" | "italic";
export type TextDecoration = "none" | "underline" | "line-through";

export interface TextLayoutParams {
	content: string;
	fontSize: number;
	fontFamily: string;
	fontWeight: TextFontWeight;
	fontStyle: TextFontStyle;
	textAlign: TextAlign;
	textDecoration?: TextDecoration;
	letterSpacing?: number;
	lineHeight?: number;
	/** 文字框宽度，占画布宽度的百分比；0 或不填 = 不折行（老工程行为不变） */
	maxWidth?: number;
}

export interface ResolvedTextLayout {
	scaledFontSize: number;
	fontString: string;
	letterSpacing: number;
	lineHeightPx: number;
	fontSizeRatio: number;
	textAlign: TextAlign;
	textDecoration: TextDecoration;
}

export interface MeasuredTextLayout extends ResolvedTextLayout {
	lines: string[];
	lineMetrics: TextMetrics[];
	block: TextBlockMeasurement;
}

export interface ResolvedTextBackgroundLike {
	enabled: boolean;
	color: string;
	paddingX: number;
	paddingY: number;
	offsetX: number;
	offsetY: number;
	cornerRadius: number;
}

export function quoteFontFamily({ fontFamily }: { fontFamily: string }): string {
	return `"${fontFamily.replace(/"/g, '\\"')}"`;
}

export function buildTextFontString({
	fontFamily,
	fontWeight,
	fontStyle,
	scaledFontSize,
}: {
	fontFamily: string;
	fontWeight: TextFontWeight;
	fontStyle: TextFontStyle;
	scaledFontSize: number;
}): string {
	return `${fontStyle} ${fontWeight} ${scaledFontSize}px ${quoteFontFamily({ fontFamily })}, sans-serif`;
}

export function resolveTextLayout({
	text,
	canvasHeight,
}: {
	text: TextLayoutParams;
	canvasHeight: number;
}): ResolvedTextLayout {
	const scaledFontSize =
		text.fontSize * (canvasHeight / FONT_SIZE_SCALE_REFERENCE);
	const fontWeight = text.fontWeight === "bold" ? "bold" : "normal";
	const fontStyle = text.fontStyle === "italic" ? "italic" : "normal";
	const letterSpacing = text.letterSpacing ?? DEFAULTS.text.letterSpacing;
	const lineHeightPx =
		scaledFontSize * (text.lineHeight ?? DEFAULTS.text.lineHeight);
	const fontSizeRatio = text.fontSize / 15;

	return {
		scaledFontSize,
		fontString: buildTextFontString({
			fontFamily: text.fontFamily,
			fontWeight,
			fontStyle,
			scaledFontSize,
		}),
		letterSpacing,
		lineHeightPx,
		fontSizeRatio,
		textAlign: text.textAlign,
		textDecoration: text.textDecoration ?? "none",
	};
}

function getWrapWidthPx({
	text,
	canvasWidth,
}: {
	text: TextLayoutParams;
	canvasWidth?: number;
}): number {
	const percent = text.maxWidth ?? 0;
	if (!canvasWidth || percent <= 0) {
		return 0;
	}
	return (canvasWidth * clamp({ value: percent, min: 0, max: 100 })) / 100;
}

export function measureTextLayout({
	text,
	canvasHeight,
	canvasWidth,
	ctx,
}: {
	text: TextLayoutParams;
	canvasHeight: number;
	/** 折行用的画布宽度；只有设了「文字框宽」才会用到 */
	canvasWidth?: number;
	ctx: TextCanvasContext;
}): MeasuredTextLayout {
	const resolvedLayout = resolveTextLayout({ text, canvasHeight });

	ctx.save();
	ctx.font = resolvedLayout.fontString;
	ctx.textBaseline = "middle";
	setCanvasLetterSpacing({
		ctx,
		letterSpacingPx: resolvedLayout.letterSpacing,
	});
	// 折行必须在字体和字间距都设好之后量，否则宽度对不上
	const lines = wrapTextContent({
		content: text.content,
		maxWidthPx: getWrapWidthPx({ text, canvasWidth }),
		measure: ({ text: line }) => ctx.measureText(line).width,
	});
	const lineMetrics = lines.map((line) => ctx.measureText(line));
	ctx.restore();

	const block = measureTextBlock({
		lineMetrics,
		lineHeightPx: resolvedLayout.lineHeightPx,
	});

	return {
		...resolvedLayout,
		lines,
		lineMetrics,
		block,
	};
}

/**
 * 每一行单独铺一次渐变（多行时每行都是完整的渐变，不会被拉成一条长条）。
 *
 * 角度用 CSS 的约定：0deg 从下往上、90deg 从左往右、180deg 从上往下（默认）。
 * 渐变线取字形盒在该方向上的投影，所以 45° 之类的斜向也是"贴着字"走而不是贴着画面。
 */
function buildLineFillStyle({
	ctx,
	layout,
	textColor,
	textColorEnd,
	textColorMid,
	gradientAngle,
	lineY,
	lineWidth,
}: {
	ctx: TextCanvasContext;
	layout: MeasuredTextLayout;
	textColor: string;
	textColorEnd?: string | null;
	textColorMid?: string | null;
	gradientAngle?: number;
	lineY: number;
	lineWidth: number;
}): string | CanvasGradient {
	if (!textColorEnd || textColorEnd === textColor) {
		return textColor;
	}
	const halfHeight = layout.scaledFontSize * 0.55;
	const halfWidth = Math.max(lineWidth, halfHeight * 2) / 2;
	const theta = ((gradientAngle ?? 180) * Math.PI) / 180;
	const dx = Math.sin(theta);
	const dy = -Math.cos(theta);
	const centerX =
		layout.textAlign === "left"
			? halfWidth
			: layout.textAlign === "right"
				? -halfWidth
				: 0;
	const span = Math.abs(halfWidth * dx) + Math.abs(halfHeight * dy);
	const gradient = ctx.createLinearGradient(
		centerX - dx * span,
		lineY - dy * span,
		centerX + dx * span,
		lineY + dy * span,
	);
	gradient.addColorStop(0, textColor);
	if (textColorMid && textColorMid !== textColor && textColorMid !== textColorEnd) {
		gradient.addColorStop(0.5, textColorMid);
	}
	gradient.addColorStop(1, textColorEnd);
	return gradient;
}

export function drawMeasuredTextLayout({
	ctx,
	layout,
	textColor,
	textColorEnd,
	textColorMid,
	gradientAngle,
	extrude,
	background,
	backgroundColor,
	stroke,
	shadow,
	textBaseline = "middle",
}: {
	ctx: TextCanvasContext;
	layout: MeasuredTextLayout;
	textColor: string;
	/** 给了就按角度渐变填充（花字用），不给就是单色 */
	textColorEnd?: string | null;
	/** 可选的中间色，凑出三段渐变 */
	textColorMid?: string | null;
	/** CSS 约定：0=下往上，90=左往右，180=上往下（默认） */
	gradientAngle?: number;
	/** 立体挤出：沿右下方向叠若干层同色文字，画在描边之前 */
	extrude?: { color: string; width: number } | null;
	background?: ResolvedTextBackgroundLike | null;
	backgroundColor?: string;
	stroke?: {
		color: string;
		width: number;
		outerColor?: string | null;
		/** 外圈描边的可见厚度：画在 `width` 之外，所以线宽是 width + 2×outerWidth */
		outerWidth?: number;
	} | null;
	shadow?: {
		color: string;
		blur: number;
		offsetX: number;
		offsetY: number;
	} | null;
	textBaseline?: CanvasTextBaseline;
}): void {
	ctx.font = layout.fontString;
	ctx.textAlign = layout.textAlign;
	ctx.textBaseline = textBaseline;
	ctx.fillStyle = textColor;
	setCanvasLetterSpacing({ ctx, letterSpacingPx: layout.letterSpacing });

	if (
		background?.enabled &&
		backgroundColor &&
		backgroundColor !== "transparent" &&
		layout.lines.length > 0
	) {
		const backgroundRect = getTextBackgroundRect({
			textAlign: layout.textAlign,
			block: layout.block,
			background: {
				...background,
				color: backgroundColor,
			},
			fontSizeRatio: layout.fontSizeRatio,
		});
		if (backgroundRect) {
			const p =
				clamp({
					value: background.cornerRadius,
					min: CORNER_RADIUS_MIN,
					max: CORNER_RADIUS_MAX,
				}) / 100;
			const radius =
				(Math.min(backgroundRect.width, backgroundRect.height) / 2) * p;
			ctx.fillStyle = backgroundColor;
			ctx.beginPath();
			ctx.roundRect(
				backgroundRect.left,
				backgroundRect.top,
				backgroundRect.width,
				backgroundRect.height,
				radius,
			);
			ctx.fill();
			ctx.fillStyle = textColor;
		}
	}

	// 安卓移植新增：阴影在填充时生效（描边也带阴影会显脏，只让填充层投影）；
	// 描边先画、填充后画，边缘才干净（剪映同款画法）。
	if (shadow) {
		ctx.shadowColor = shadow.color;
		ctx.shadowBlur = shadow.blur;
		ctx.shadowOffsetX = shadow.offsetX;
		ctx.shadowOffsetY = shadow.offsetY;
	}

	const innerStrokeWidth = stroke?.width ?? 0;
	const outerStrokeWidth = stroke?.outerWidth ?? 0;
	const hasStroke =
		innerStrokeWidth > 0 || outerStrokeWidth > 0;
	const hideShadow = () => {
		ctx.shadowColor = "transparent";
		ctx.shadowBlur = 0;
		ctx.shadowOffsetX = 0;
		ctx.shadowOffsetY = 0;
	};
	const showShadow = () => {
		if (!shadow) return;
		ctx.shadowColor = shadow.color;
		ctx.shadowBlur = shadow.blur;
		ctx.shadowOffsetX = shadow.offsetX;
		ctx.shadowOffsetY = shadow.offsetY;
	};

	for (let index = 0; index < layout.lines.length; index++) {
		const lineY = index * layout.lineHeightPx - layout.block.visualCenterOffset;
		const lineWidth = layout.lineMetrics[index]?.width ?? 0;
		if (extrude && extrude.width > 0) {
			/*
			 * 立体字：沿右下方向叠若干层实心副本，最远的先画。
			 *
			 * 深度按**字号的百分比**算，不是原始像素 —— 字号本身是相对画布高的
			 * （见 scaledFontSize），用绝对像素的话同一套花字在 720p 和 1080p 上
			 * 立体感差一倍，而且大字上几乎看不出来。
			 * 层数封顶 16 层：每层一次 fillText，手机上每帧都要跑。
			 */
			if (shadow) hideShadow();
			ctx.fillStyle = extrude.color;
			const depthPx = (extrude.width / 100) * layout.scaledFontSize;
			const steps = Math.min(Math.max(Math.round(depthPx), 1), 16);
			const perStep = depthPx / steps;
			for (let depth = steps; depth >= 1; depth--) {
				const offset = depth * perStep * 0.75;
				ctx.fillText(layout.lines[index], offset, lineY + offset);
			}
			if (shadow) showShadow();
		}
		if (stroke && hasStroke) {
			// 描边层不带阴影（阴影只在填充层，否则叠两层发脏）
			if (shadow) hideShadow();
			ctx.lineJoin = "round";
			ctx.lineCap = "round";
			/*
			 * 外圈先画。canvas 的 strokeText 是沿字形边缘居中的，所以外圈线宽要取
			 * 「内圈 + 2×可见厚度」，多出来的那一半才真的套在内圈外面 —— 剪映的
			 * 「描边 / 外描边」两层就是这个。
			 */
			if (outerStrokeWidth > 0) {
				ctx.strokeStyle = stroke.outerColor || stroke.color;
				ctx.lineWidth = innerStrokeWidth + outerStrokeWidth * 2;
				ctx.strokeText(layout.lines[index], 0, lineY);
			}
			if (innerStrokeWidth > 0) {
				ctx.strokeStyle = stroke.color;
				ctx.lineWidth = innerStrokeWidth;
				ctx.strokeText(layout.lines[index], 0, lineY);
			}
			if (shadow) showShadow();
		}
		ctx.fillStyle = buildLineFillStyle({
			ctx,
			layout,
			textColor,
			textColorEnd,
			textColorMid,
			gradientAngle,
			lineY,
			lineWidth,
		});
		ctx.fillText(layout.lines[index], 0, lineY);
		drawTextDecoration({
			ctx,
			textDecoration: layout.textDecoration,
			lineWidth: layout.lineMetrics[index].width,
			lineY,
			metrics: layout.lineMetrics[index],
			scaledFontSize: layout.scaledFontSize,
			textAlign: layout.textAlign,
		});
	}

	if (shadow) {
		ctx.shadowColor = "transparent";
		ctx.shadowBlur = 0;
		ctx.shadowOffsetX = 0;
		ctx.shadowOffsetY = 0;
	}
}

export function strokeMeasuredTextLayout({
	ctx,
	layout,
	strokeColor,
	strokeWidth,
	textBaseline = "middle",
}: {
	ctx: TextCanvasContext;
	layout: MeasuredTextLayout;
	strokeColor: string;
	strokeWidth: number;
	textBaseline?: CanvasTextBaseline;
}): void {
	ctx.font = layout.fontString;
	ctx.textAlign = layout.textAlign;
	ctx.textBaseline = textBaseline;
	ctx.strokeStyle = strokeColor;
	ctx.lineWidth = strokeWidth;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	setCanvasLetterSpacing({ ctx, letterSpacingPx: layout.letterSpacing });

	for (let index = 0; index < layout.lines.length; index++) {
		const lineY = index * layout.lineHeightPx - layout.block.visualCenterOffset;
		ctx.strokeText(layout.lines[index], 0, lineY);
	}
}
