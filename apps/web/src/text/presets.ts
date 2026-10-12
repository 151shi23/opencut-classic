import type { CSSProperties } from "react";
import type { ParamValues } from "@/params";

/*
 * 文字样式预设：一键带着一整套排版/描边/阴影/底色落进时间轴。
 *
 * params 的键就是 `params/registry.ts` 里那批文字参数，直接覆盖在
 * `DEFAULTS.text.element.params` 之上，所以这里不需要重复写默认值。
 * fontSize 是"画布高 / 90"的倍数（见 text/primitives.ts 的 scaledFontSize），
 * 15 ≈ 1080p 上 180px 高，所以标题类给到 22~26。
 */
export interface TextPreset {
	key: string;
	label: string;
	content: string;
	params: ParamValues;
}

export const PLACEHOLDER_TEXT = "输入文字";

export const TEXT_PRESETS: readonly TextPreset[] = [
	{
		key: "default",
		label: "Default text",
		content: PLACEHOLDER_TEXT,
		params: {},
	},
	{
		key: "title",
		label: "Main title",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 26,
			fontWeight: "bold",
			lineHeight: 1.25,
			letterSpacing: 1,
			"shadow.enabled": true,
			"shadow.color": "#000000",
			"shadow.blur": 14,
			"shadow.offsetY": 8,
		},
	},
	{
		key: "subtitle",
		label: "Subtitle",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 12,
			color: "#E6E6E6",
			letterSpacing: 3,
		},
	},
	{
		key: "outline",
		label: "Outlined title",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 22,
			fontWeight: "bold",
			color: "#FFFFFF",
			"stroke.enabled": true,
			"stroke.color": "#000000",
			"stroke.width": 6,
		},
	},
	{
		key: "bar",
		label: "Caption bar",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 10,
			color: "#FFFFFF",
			"background.enabled": true,
			"background.color": "#000000",
			"background.cornerRadius": 30,
			"background.paddingX": 26,
			"background.paddingY": 14,
		},
	},
	{
		key: "gold",
		label: "Gilded text",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 24,
			fontWeight: "bold",
			color: "#FFD87A",
			"stroke.enabled": true,
			"stroke.color": "#7A4B00",
			"stroke.width": 3,
			"shadow.enabled": true,
			"shadow.color": "#000000",
			"shadow.blur": 10,
			"shadow.offsetY": 5,
		},
	},
] as const;

/**
 * 卡片预览：用 CSS 近似画布上的样子（描边、底条、投影）。
 * 只是让人一眼挑得中样式，不追求和渲染逐像素一致。
 */
export function buildPresetPreviewStyle({
	preset,
}: {
	preset: TextPreset;
}): CSSProperties {
	const numberParam = (key: string, fallback: number): number => {
		const value = preset.params[key];
		return typeof value === "number" ? value : fallback;
	};
	const stringParam = (key: string, fallback: string): string => {
		const value = preset.params[key];
		return typeof value === "string" ? value : fallback;
	};
	const flagParam = (key: string): boolean => preset.params[key] === true;

	const fontSize = numberParam("fontSize", 15);
	const style: CSSProperties = {
		fontSize: `${(4 + fontSize * 0.55).toFixed(1)}px`,
		fontWeight: stringParam("fontWeight", "normal") === "bold" ? 700 : 400,
		color: stringParam("color", "#FFFFFF"),
		letterSpacing: `${(numberParam("letterSpacing", 0) * 0.25).toFixed(2)}px`,
	};

	if (flagParam("stroke.enabled")) {
		style.WebkitTextStroke = `${Math.max(
			0.6,
			numberParam("stroke.width", 4) * 0.18,
		).toFixed(1)}px ${stringParam("stroke.color", "#000000")}`;
	}
	if (flagParam("shadow.enabled")) {
		style.textShadow = `0 ${(numberParam("shadow.offsetY", 4) * 0.15).toFixed(1)}px ${(
			numberParam("shadow.blur", 8) * 0.12
		).toFixed(1)}px ${stringParam("shadow.color", "#000000")}`;
	}
	if (flagParam("background.enabled")) {
		style.backgroundColor = stringParam("background.color", "#000000");
		style.borderRadius = `${(numberParam("background.cornerRadius", 0) * 0.12).toFixed(1)}px`;
		style.padding = `${(numberParam("background.paddingY", 0) * 0.1).toFixed(1)}px ${(
			numberParam("background.paddingX", 0) * 0.1
		).toFixed(1)}px`;
	}
	return style;
}
