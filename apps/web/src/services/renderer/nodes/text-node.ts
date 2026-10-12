import { BaseNode } from "./base-node";
import type { TextElement } from "@/timeline";
import type { EffectPass, ElementCanvas2d } from "@/effects/types";
import type { BlendMode, Transform } from "@/rendering";
import { drawMeasuredTextLayout } from "@/text/primitives";
import type { MeasuredTextElement } from "@/text/measure-element";

export type TextNodeParams = TextElement & {
	transform: Transform;
	opacity: number;
	blendMode?: BlendMode;
	canvasCenter: { x: number; y: number };
	canvasHeight: number;
	/** 「文字框宽」按画布宽度的百分比折行，所以排版要知道宽度 */
	canvasWidth?: number;
	textBaseline?: CanvasTextBaseline;
};

/** 安卓移植新增：文字描边 / 阴影（剪映同款）。 */
export interface ResolvedTextStroke {
	color: string;
	width: number;
}

export interface ResolvedTextShadow {
	color: string;
	blur: number;
	offsetX: number;
	offsetY: number;
}

export interface ResolvedTextNodeState {
	transform: Transform;
	opacity: number;
	textColor: string;
	backgroundColor: string;
	stroke: ResolvedTextStroke | null;
	shadow: ResolvedTextShadow | null;
	effectPasses: EffectPass[][];
	canvas2d: ElementCanvas2d | null;
	measuredText: MeasuredTextElement;
}

export class TextNode extends BaseNode<TextNodeParams, ResolvedTextNodeState> {}

export function renderTextToContext({
	node,
	ctx,
}: {
	node: TextNode;
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}): void {
	const resolved = node.resolved;
	if (!resolved) {
		return;
	}

	const x = resolved.transform.position.x + node.params.canvasCenter.x;
	const y = resolved.transform.position.y + node.params.canvasCenter.y;
	const baseline = node.params.textBaseline ?? "middle";

	ctx.save();
	ctx.translate(x, y);
	ctx.scale(resolved.transform.scaleX, resolved.transform.scaleY);
	if (resolved.transform.rotate) {
		ctx.rotate((resolved.transform.rotate * Math.PI) / 180);
	}

	drawMeasuredTextLayout({
		ctx,
		layout: resolved.measuredText,
		textColor: resolved.textColor,
		background: resolved.measuredText.resolvedBackground,
		backgroundColor: resolved.backgroundColor,
		stroke: resolved.stroke,
		shadow: resolved.shadow,
		textBaseline: baseline,
	});

	ctx.restore();
}
