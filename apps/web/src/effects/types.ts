import type { ParamDefinition, ParamValues } from "@/params";

export interface Effect {
	id: string;
	type: string;
	params: ParamValues;
	enabled: boolean;
}

export type EffectUniformValue = number | number[];

export interface EffectPass {
	shader: string;
	uniforms: Record<string, EffectUniformValue>;
}

export interface EffectPassTemplate {
	shader: string;
	uniforms(params: {
		effectParams: ParamValues;
		width: number;
		height: number;
	}): Record<string, EffectUniformValue>;
}

export interface EffectCanvas2dPaintArgs {
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	width: number;
	height: number;
}

export interface EffectCanvas2dResult {
	/** CSS filter 函数串，直接赋给 2D 上下文的 ctx.filter */
	filter?: string;
	/** 滤镜之后叠加的 2D 绘制（暗角、噪点、扫描线、漏光、遮幅） */
	paint?: (args: EffectCanvas2dPaintArgs) => void;
}

export interface EffectRendererConfig {
	passes: EffectPassTemplate[];
	buildPasses?: (params: {
		effectParams: ParamValues;
		width: number;
		height: number;
	}) => EffectPass[];
	/**
	 * 安卓移植新增：wasm 那边只注册了 gaussian-blur 一个着色器，未知 shader 会让
	 * renderFrame 直接抛错。调色与叠加类特效走这条 Canvas2D 通道 —— 在元素纹理
	 * 上传给 wasm 之前完成，预览和导出共用同一条路径。
	 */
	canvas2d?: (params: {
		effectParams: ParamValues;
		width: number;
		height: number;
	}) => EffectCanvas2dResult;
}

export interface EffectDefinition {
	type: string;
	name: string;
	keywords: string[];
	params: ParamDefinition[];
	renderer: EffectRendererConfig;
}

/** 一个元素当帧合并后的 Canvas2D 通道状态；key 参与纹理缓存判定 */
export interface ElementCanvas2d {
	key: string;
	filter: string | null;
	paint: ((args: EffectCanvas2dPaintArgs) => void) | null;
}
