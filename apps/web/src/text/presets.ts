import type { CSSProperties } from "react";
import type { ParamValues } from "@/params";

/*
 * 文字样式预设：一键带着一整套排版/填充/描边/阴影落进时间轴。
 *
 * params 的键就是 `params/registry.ts` 里那批文字参数，直接覆盖在
 * `DEFAULTS.text.element.params` 之上，所以这里不需要重复写默认值。
 * fontSize 是"画布高 / 90"的倍数（见 text/primitives.ts 的 scaledFontSize），
 * 15 ≈ 1080p 上 180px 高，所以标题/花字类给到 22~26。
 *
 * 花字靠三样东西：color→colorEnd 的竖向渐变填充、stroke + stroke.outer* 两圈描边、
 * 以及 offsetY=0 的阴影（就是发光）。这三个能力都在渲染侧真的采样。
 */
export interface TextPreset {
	key: string;
	label: string;
	content: string;
	params: ParamValues;
}

export const PLACEHOLDER_TEXT = "输入文字";

const glow = (color: string, blur: number): ParamValues => ({
	"shadow.enabled": true,
	"shadow.color": color,
	"shadow.blur": blur,
	"shadow.offsetX": 0,
	"shadow.offsetY": 0,
});

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
		key: "pop3d",
		label: "Solid pop",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 24,
			fontWeight: "bold",
			color: "#FFFFFF",
			"stroke.enabled": true,
			"stroke.color": "#000000",
			"stroke.width": 5,
			// blur 0 + 偏移 = 硬边投影，就是那种立体字
			"shadow.enabled": true,
			"shadow.color": "#000000",
			"shadow.blur": 0,
			"shadow.offsetX": 7,
			"shadow.offsetY": 7,
		},
	},

	// ---- 花字：渐变填充 + 两圈描边 + 发光 ----
	{
		key: "neon",
		label: "Neon blue",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 24,
			fontWeight: "bold",
			color: "#8FFBFF",
			colorEnd: "#1E6FFF",
			"stroke.enabled": true,
			"stroke.color": "#0A1A2F",
			"stroke.width": 2,
			"stroke.outerColor": "#8FFBFF",
			"stroke.outerWidth": 5,
			...glow("#00E5FF", 26),
		},
	},
	{
		key: "goldfoil",
		label: "Gold foil",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 26,
			fontWeight: "bold",
			color: "#FFF3B0",
			colorEnd: "#B8860B",
			"stroke.enabled": true,
			"stroke.color": "#6B4A00",
			"stroke.width": 3,
			"stroke.outerColor": "#FFF3B0",
			"stroke.outerWidth": 3,
			"shadow.enabled": true,
			"shadow.color": "#000000",
			"shadow.blur": 10,
			"shadow.offsetY": 6,
		},
	},
	{
		key: "lava",
		label: "Hot lava",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 26,
			fontWeight: "bold",
			color: "#FFFFFF",
			colorEnd: "#FF3B3B",
			"stroke.enabled": true,
			"stroke.color": "#7A0000",
			"stroke.width": 2,
			"stroke.outerColor": "#FFFFFF",
			"stroke.outerWidth": 4,
			...glow("#FF5722", 20),
		},
	},
	{
		key: "sakura",
		label: "Sakura pink",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 22,
			fontWeight: "bold",
			color: "#FFE1EF",
			colorEnd: "#FF6FA5",
			"stroke.enabled": true,
			"stroke.color": "#FFFFFF",
			"stroke.width": 4,
			"stroke.outerColor": "#FF3D7F",
			"stroke.outerWidth": 3,
		},
	},
	{
		key: "toxic",
		label: "Toxic green",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 24,
			fontWeight: "bold",
			color: "#E4FF72",
			colorEnd: "#39C86B",
			"stroke.enabled": true,
			"stroke.color": "#0B2B12",
			"stroke.width": 3,
			"stroke.outerColor": "#39FF14",
			"stroke.outerWidth": 2,
			...glow("#39FF14", 22),
		},
	},
	{
		key: "starlight",
		label: "Starlight purple",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 24,
			fontWeight: "bold",
			color: "#E0C3FC",
			colorEnd: "#8E2DE2",
			"stroke.enabled": true,
			"stroke.color": "#FFFFFF",
			"stroke.width": 2,
			"stroke.outerColor": "#2A0845",
			"stroke.outerWidth": 4,
			...glow("#B06CFF", 18),
		},
	},
	{
		key: "ice",
		label: "Ice crystal",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 24,
			fontWeight: "bold",
			color: "#F2FCFF",
			colorEnd: "#5FB8E8",
			"stroke.enabled": true,
			"stroke.color": "#FFFFFF",
			"stroke.width": 3,
			"stroke.outerColor": "#1E6FFF",
			"stroke.outerWidth": 2,
			...glow("#8FDBFF", 18),
		},
	},
	{
		key: "sunset",
		label: "Sunset orange",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 24,
			fontWeight: "bold",
			color: "#FFE259",
			colorEnd: "#FFA751",
			"stroke.enabled": true,
			"stroke.color": "#8A3B12",
			"stroke.width": 2,
			"stroke.outerColor": "#FFD98A",
			"stroke.outerWidth": 4,
			...glow("#FF9A3C", 16),
		},
	},
] as const;

/**
 * 卡片预览：用 CSS 近似画布上的样子（渐变填充、两圈描边、发光、底条）。
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

	const gradientEnd = stringParam("colorEnd", "");
	if (gradientEnd && gradientEnd !== style.color) {
		// 和渲染侧一样：从上到下的竖向渐变，用 background-clip 裁到字上
		style.backgroundImage = `linear-gradient(180deg, ${style.color}, ${gradientEnd})`;
		style.backgroundClip = "text";
		style.WebkitBackgroundClip = "text";
		style.WebkitTextFillColor = "transparent";
	}

	if (flagParam("stroke.enabled")) {
		// 两圈合并成一条更粗的描边来示意，颜色取外圈（视觉上占主导）
		const outer = numberParam("stroke.outerWidth", 0);
		const width = numberParam("stroke.width", 4) + outer * 2;
		style.WebkitTextStroke = `${Math.max(
			0.6,
			width * 0.14,
		).toFixed(1)}px ${
			outer > 0 ? stringParam("stroke.outerColor", "#000000") : stringParam("stroke.color", "#000000")
		}`;
	}
	if (flagParam("shadow.enabled")) {
		const offsetY = numberParam("shadow.offsetY", 0);
		const offsetX = numberParam("shadow.offsetX", 0);
		style.textShadow = `${(offsetX * 0.12).toFixed(1)}px ${(
			offsetY * 0.12
		).toFixed(1)}px ${(numberParam("shadow.blur", 8) * 0.12).toFixed(1)}px ${stringParam(
			"shadow.color",
			"#000000",
		)}`;
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
