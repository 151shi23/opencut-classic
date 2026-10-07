import { useCallback, useEffect, useState } from "react";

/**
 * 安卓 WebView 里标准全屏不可靠：requestFullscreen() 要么被静默忽略，要么只回调原生
 * onShowCustomView 而不派发 fullscreenchange —— 按钮状态跟不上，点进去就出不来。
 * 所以容器带 data-android 标记时改走 CSS 铺满（.mw-preview-fullscreen），状态自己管；
 * 桌面浏览器仍然用标准全屏 API。
 */
const FULLSCREEN_CLASS = "mw-preview-fullscreen";

function isCssFullscreenMode() {
	return typeof document !== "undefined"
		&& document.documentElement.hasAttribute("data-android");
}

export function useFullscreen({
	containerRef,
}: {
	containerRef: React.RefObject<HTMLElement | null>;
}) {
	const [isCssFullscreen, setIsCssFullscreen] = useState(false);
	const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);

	useEffect(() => {
		const handleChange = () => {
			setIsNativeFullscreen(document.fullscreenElement !== null);
		};
		document.addEventListener("fullscreenchange", handleChange);
		return () => {
			document.removeEventListener("fullscreenchange", handleChange);
		};
	}, []);

	const toggleFullscreen = useCallback(() => {
		const node = containerRef.current;
		if (!node) return;

		if (isCssFullscreenMode()) {
			const next = !node.classList.contains(FULLSCREEN_CLASS);
			node.classList.toggle(FULLSCREEN_CLASS, next);
			setIsCssFullscreen(next);
			return;
		}

		if (document.fullscreenElement) {
			document.exitFullscreen();
		} else {
			node.requestFullscreen?.();
		}
	}, [containerRef]);

	return {
		isFullscreen: isCssFullscreen || isNativeFullscreen,
		toggleFullscreen,
	};
}
