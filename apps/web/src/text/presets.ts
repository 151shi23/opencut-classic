import type { CSSProperties } from "react";
import type { ParamValues } from "@/params";

/*
 * 文字样式预设：一键带着一整套排版/填充/描边/阴影落进时间轴。
 *
 * params 的键就是 `params/registry.ts` 里那批文字参数，直接覆盖在
 * `DEFAULTS.text.element.params` 之上，所以这里不需要重复写默认值。
 * label 别超过 20 个字符：卡片名字超长会先被截断成 "Blue and white p...ain"，
 * 汉化层是按整句查表的，截断之后就再也对不上了。
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

	// ---- 中国传统色：配色有出处，不是随手调的荧光 ----
	{
		// 王希孟《千里江山图》的石青石绿：山脚的深、山脊的亮
		key: "qianli",
		label: "Thousand Li Rivers",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 24,
			fontWeight: "bold",
			letterSpacing: 2,
			color: "#9FE0D0",
			colorMid: "#2E7C9B",
			colorEnd: "#16324F",
			gradientAngle: 180,
			"stroke.enabled": true,
			"stroke.color": "#0B1E33",
			"stroke.width": 2,
			"stroke.outerColor": "#9FE0D0",
			"stroke.outerWidth": 3,
		},
	},
	{
		// 青花：白瓷底走到钴料蓝，斜向才像笔锋扫过
		key: "qinghua",
		label: "Blue-white porcelain",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 22,
			fontWeight: "bold",
			color: "#FFFFFF",
			colorEnd: "#1B4E9C",
			gradientAngle: 145,
			"stroke.enabled": true,
			"stroke.color": "#143C78",
			"stroke.width": 2,
			"stroke.outerColor": "#FFFFFF",
			"stroke.outerWidth": 3,
		},
	},
	{
		// 朱砂 + 宫墙红，节庆和标题都能压得住
		key: "zhusha",
		label: "Vermilion palace",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 24,
			fontWeight: "bold",
			color: "#FFC9A3",
			colorMid: "#E1483F",
			colorEnd: "#8E1D1D",
			gradientAngle: 180,
			"stroke.enabled": true,
			"stroke.color": "#4A0F0F",
			"stroke.width": 2,
			"stroke.outerColor": "#FFD9A0",
			"stroke.outerWidth": 3,
		},
	},
	{
		// 鎏金：亮金→赤金→暗金三段，配硬投影才不像塑料
		key: "liujin",
		label: "Gilt gold",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 26,
			fontWeight: "bold",
			color: "#FFF6C9",
			colorMid: "#E8B923",
			colorEnd: "#8C5A00",
			gradientAngle: 165,
			"stroke.enabled": true,
			"stroke.color": "#5A3200",
			"stroke.width": 2,
			"stroke.outerColor": "#FFE9A8",
			"stroke.outerWidth": 3,
			"shadow.enabled": true,
			"shadow.color": "#2A1B00",
			"shadow.blur": 10,
			"shadow.offsetY": 6,
		},
	},
	{
		// 水墨：不描边、字距放宽，靠灰阶和留白
		key: "shuimo",
		label: "Ink wash",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 20,
			color: "#2B2B2B",
			colorEnd: "#9A9A9A",
			gradientAngle: 180,
			letterSpacing: 8,
			lineHeight: 1.5,
		},
	},
	{
		// 敦煌壁画的石绿叠土红底
		key: "dunhuang",
		label: "Dunhuang mural",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 24,
			fontWeight: "bold",
			color: "#F3D9A4",
			colorMid: "#7FA98B",
			colorEnd: "#2F6B57",
			gradientAngle: 135,
			"stroke.enabled": true,
			"stroke.color": "#8C4A2B",
			"stroke.width": 2,
			"stroke.outerColor": "#F3D9A4",
			"stroke.outerWidth": 3,
		},
	},
	{
		// 唐三彩的黄、褐、绿三釉并置
		key: "sancai",
		label: "Tang three-color",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 24,
			fontWeight: "bold",
			color: "#F2C14E",
			colorMid: "#C84B31",
			colorEnd: "#3F7D5B",
			gradientAngle: 120,
			"stroke.enabled": true,
			"stroke.color": "#3A2413",
			"stroke.width": 2,
			"stroke.outerColor": "#F7E7C8",
			"stroke.outerWidth": 3,
		},
	},
	{
		// 龙泉粉青：釉面那种由内透出来的润
		key: "longquan",
		label: "Celadon glaze",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 22,
			color: "#E8F7F0",
			colorEnd: "#6FB6A0",
			gradientAngle: 200,
			"stroke.enabled": true,
			"stroke.color": "#2E6B5A",
			"stroke.width": 2,
			"stroke.outerColor": "#E8F7F0",
			"stroke.outerWidth": 2,
			...glow("#9FE8D2", 14),
		},
	},

	// ---- 立体（挤出）与场景款 ----
	{
		key: "popwhite",
		label: "White 3D",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 26,
			fontWeight: "bold",
			color: "#FFFFFF",
			"stroke.enabled": true,
			"stroke.color": "#1E6FFF",
			"stroke.width": 2,
			"extrude.color": "#1E6FFF",
			"extrude.width": 16,
		},
	},
	{
		key: "blackgold3d",
		label: "Black gold 3D",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 26,
			fontWeight: "bold",
			color: "#FFE9A8",
			colorEnd: "#C79A2E",
			"stroke.enabled": true,
			"stroke.color": "#1B1200",
			"stroke.width": 2,
			"extrude.color": "#1B1200",
			"extrude.width": 18,
		},
	},
	{
		key: "candy3d",
		label: "Candy 3D",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 24,
			fontWeight: "bold",
			color: "#FFE1EF",
			colorEnd: "#FF6FA5",
			"stroke.enabled": true,
			"stroke.color": "#FFFFFF",
			"stroke.width": 3,
			"extrude.color": "#B03A63",
			"extrude.width": 14,
		},
	},
	{
		key: "dawn",
		label: "First light",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 24,
			fontWeight: "bold",
			color: "#FFF1C9",
			colorMid: "#FF9A3C",
			colorEnd: "#C93756",
			gradientAngle: 200,
			"stroke.enabled": true,
			"stroke.color": "#6E1F2F",
			"stroke.width": 2,
			"stroke.outerColor": "#FFE29A",
			"stroke.outerWidth": 3,
		},
	},
	{
		key: "deepsea",
		label: "Deep sea",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 24,
			fontWeight: "bold",
			color: "#BFF3FF",
			colorMid: "#2E86C1",
			colorEnd: "#0B2545",
			gradientAngle: 180,
			"stroke.enabled": true,
			"stroke.color": "#04101F",
			"stroke.width": 2,
			"stroke.outerColor": "#29B6F6",
			"stroke.outerWidth": 2,
			...glow("#29B6F6", 20),
		},
	},
	{
		key: "cyber",
		label: "Cyber violet",
		content: PLACEHOLDER_TEXT,
		params: {
			fontSize: 24,
			fontWeight: "bold",
			letterSpacing: 2,
			color: "#F0C1FF",
			colorMid: "#A55EEA",
			colorEnd: "#2E0F5B",
			gradientAngle: 115,
			"stroke.enabled": true,
			"stroke.color": "#12002B",
			"stroke.width": 2,
			"stroke.outerColor": "#FF3FD0",
			"stroke.outerWidth": 3,
			...glow("#FF3FD0", 22),
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
	const gradientMid = stringParam("colorMid", "");
	const angle = numberParam("gradientAngle", 180);
	if (gradientEnd && gradientEnd !== style.color) {
		// 和渲染侧同一套约定：CSS 角度，0=下往上、90=左往右、180=上往下
		const stops = [
			style.color,
			...(gradientMid && gradientMid !== style.color && gradientMid !== gradientEnd
				? [gradientMid]
				: []),
			gradientEnd,
		].join(", ");
		style.backgroundImage = `linear-gradient(${angle}deg, ${stops})`;
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
	const shadows: string[] = [];
	const extrudeDepth = numberParam("extrude.width", 0);
	if (extrudeDepth > 0) {
		// 渲染侧是逐层副本，卡片用三层硬阴影示意同一个方向
		const step = Math.max(0.5, extrudeDepth * 0.05);
		const color = stringParam("extrude.color", "#000000");
		for (let i = 1; i <= 3; i++) {
			shadows.push(
				`${(step * i).toFixed(1)}px ${(step * i).toFixed(1)}px 0 ${color}`,
			);
		}
	}
	if (flagParam("shadow.enabled")) {
		const offsetY = numberParam("shadow.offsetY", 0);
		const offsetX = numberParam("shadow.offsetX", 0);
		shadows.push(
			`${(offsetX * 0.12).toFixed(1)}px ${(offsetY * 0.12).toFixed(1)}px ${(
				numberParam("shadow.blur", 8) * 0.12
			).toFixed(1)}px ${stringParam("shadow.color", "#000000")}`,
		);
	}
	if (shadows.length > 0) {
		style.textShadow = shadows.join(", ");
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
