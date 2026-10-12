import { describe, expect, test } from "bun:test";
import { ANIMATION_PROPERTY_PATHS } from "@/animation/types";

/*
 * 直接查 `ANIMATION_PROPERTY_PATHS` 这张表，而不是调 `isAnimationPath()`：
 * `animation/path.ts` 会 runtime 牵进 `effect-param-channel` → `keyframes`/`resolve`
 * → `@/wasm`，而 `opencut-wasm@0.2.10` 在 bun test 下起不来（`__wbindgen_start`
 * 不存在，仓库里那几条既有失败都是同一原因）。`types.ts` 除了这张 const 数组
 * 只有类型导入，所以这条测试能在整套里真的跑起来。
 *
 * 为什么要钉它：文字面板给关键帧用的路径是裸 key（`ElementParamsTab` 传
 * `propertyPath: param.key`，见 element-params-tab.tsx:87），而时间轴泳道和曲线
 * 编辑器都先过 `isAnimationPath()`。字号 / 字间距 / 行高 / 描边粗细 / 阴影模糊与
 * 偏移一开始不在这张表里 —— 关键帧写得进数据、渲染器不采样、展开轨道也没有那一行。
 */
const PATHS = new Set<string>(ANIMATION_PROPERTY_PATHS);

describe("text keyframe paths", () => {
	test("every keyframable text param is a registered path", () => {
		for (const path of [
			"fontSize",
			"letterSpacing",
			"lineHeight",
			"stroke.color",
			"stroke.width",
			"shadow.color",
			"shadow.blur",
			"shadow.offsetX",
			"shadow.offsetY",
		]) {
			expect(PATHS.has(path)).toBe(true);
		}
	});

	test("values that can't be interpolated stay unregistered", () => {
		// 开关和下拉框在参数注册表里标了 keyframable: false：布尔/枚举没有插值可言，
		// 别哪天误当成"支持关键帧"。
		expect(PATHS.has("stroke.enabled")).toBe(false);
		expect(PATHS.has("shadow.enabled")).toBe(false);
		expect(PATHS.has("textAlign")).toBe(false);
		expect(PATHS.has("blendMode")).toBe(false);
	});
});
