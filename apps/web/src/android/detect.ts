/**
 * 判定「现在跑在 App 容器里」：由 src/android/adapter.tsx 的头部脚本在首帧之前把
 * data-android 写到 <html> 上，所以渲染期读它就是终值，不会有 hydration 抖动。
 *
 * 单独成模块：这里不许引任何重量级依赖（本地化词典之类），否则会被 UI 基础组件
 * 拖进每个 chunk。
 */
export function isAndroidUI(): boolean {
	return (
		typeof document !== "undefined" &&
		document.documentElement.hasAttribute("data-android")
	);
}
