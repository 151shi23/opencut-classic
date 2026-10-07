import { useEffect, type RefObject } from "react";
import { isAndroidUI } from "@/android/detect";

/** 起手先走这么多像素再判定是不是一次平移，避免手指一碰就抢事件 */
const PAN_THRESHOLD_PX = 8;

/**
 * 片段体、裁剪把手、播放头各自接管触摸（拖片段 / 剪时长 / 跟手扫指针），
 * 手势从这些地方起手时不做平移，否则会抢掉编辑手势。
 */
const PAN_BLOCKED_SELECTOR = [
	"[data-mw-element-surface]",
	"[data-mw-resize-handle]",
	"[data-mw-playhead]",
].join(",");

/**
 * 时间轴轨道区在手机上改成手指拖动平移。
 *
 * 原来是「轨道空白处交给原生滚动 + 滚轮监听管桌面」，但手机上手指基本落在片段上、
 * 轨道空白又窄，实测划不动，只能靠缩放按钮一格一格挪。这里在滚动容器上直接吃
 * touchmove 写 scrollLeft/scrollTop：目标确定、跟手，也不赌原生滚动的判定。
 */
export function useTimelineTouchPan({
	scrollRef,
	onPan,
	enabled = isAndroidUI(),
}: {
	scrollRef: RefObject<HTMLDivElement | null>;
	onPan: () => void;
	enabled?: boolean;
}) {
	useEffect(() => {
		if (!enabled) return;
		const scroller = scrollRef.current;
		if (!scroller) return;

		let startX = 0;
		let startY = 0;
		let startScrollLeft = 0;
		let startScrollTop = 0;
		let blocked = true;
		let panning = false;

		const reset = () => {
			blocked = true;
			panning = false;
		};

		// 用捕获阶段起手：片段的 touchstart 会 stopPropagation，
		// 冒泡阶段监听就收不到落在片段上的手势，坐标会残留上一次手势的值。
		const onTouchStart = (event: TouchEvent) => {
			reset();
			if (event.touches.length !== 1) return;
			const target = event.target;
			blocked =
				target instanceof Element &&
				target.closest(PAN_BLOCKED_SELECTOR) !== null;
			if (blocked) return;
			const touch = event.touches[0];
			if (!touch) return;
			startX = touch.clientX;
			startY = touch.clientY;
			startScrollLeft = scroller.scrollLeft;
			startScrollTop = scroller.scrollTop;
		};

		const onTouchMove = (event: TouchEvent) => {
			if (blocked || event.touches.length !== 1) return;
			const touch = event.touches[0];
			if (!touch) return;

			const deltaX = touch.clientX - startX;
			const deltaY = touch.clientY - startY;

			if (!panning) {
				if (
					Math.abs(deltaX) < PAN_THRESHOLD_PX &&
					Math.abs(deltaY) < PAN_THRESHOLD_PX
				) {
					return;
				}
				panning = true;
			}

			// 接管后必须压住原生滚动，否则浏览器和我们各推一次，内容会抖
			event.preventDefault();
			scroller.scrollLeft = Math.max(0, startScrollLeft - deltaX);
			scroller.scrollTop = Math.max(0, startScrollTop - deltaY);
			onPan();
		};

		scroller.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
		scroller.addEventListener("touchmove", onTouchMove, { passive: false });
		scroller.addEventListener("touchend", reset);
		scroller.addEventListener("touchcancel", reset);

		return () => {
			scroller.removeEventListener("touchstart", onTouchStart, { capture: true });
			scroller.removeEventListener("touchmove", onTouchMove);
			scroller.removeEventListener("touchend", reset);
			scroller.removeEventListener("touchcancel", reset);
		};
	}, [enabled, onPan, scrollRef]);
}
