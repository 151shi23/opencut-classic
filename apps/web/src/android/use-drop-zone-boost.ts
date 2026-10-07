"use client";

import { useEffect } from "react";
import { isAndroidUI } from "@/android/detect";
import { mwPanelHandle, resizeMwPanel } from "@/android/panel-toggles";
import {
	TIMELINE_RULER_HEIGHT_PX,
	TIMELINE_TRACK_GAP_PX,
	TIMELINE_TRACK_HEIGHTS_PX,
} from "@/timeline/components/layout";

/** 时间轴工具条在安卓模式下压到 1.9rem（见 android.css）。 */
const TOOLBAR_HEIGHT_PX = 30;

/**
 * 落点区的最小可用高度：标尺 + 一条视频轨 + 一条文字轨 + 轨道间隙 + 工具条。
 * 低于这个值，手指就只能在那一两条轨道里放，放错行还得先手动拉面板。
 */
const MIN_DROP_ZONE_HEIGHT_PX =
	TOOLBAR_HEIGHT_PX +
	TIMELINE_RULER_HEIGHT_PX +
	TIMELINE_TRACK_HEIGHTS_PX.video +
	TIMELINE_TRACK_HEIGHTS_PX.text +
	TIMELINE_TRACK_GAP_PX * 2;

/** 扩容后的时间轴占比。再往上就给预览挤得看不清画面了。 */
const BOOST_TIMELINE_SIZE_PERCENT = 46;

/**
 * 拖素材时自动把工程区（时间轴）放大：手机竖切是固定的，起手才发现轨道区只有几十
 * 像素高，手指根本够不着目标轨道。拖拽一开始就按占比扩容，纵切组会让上方的素材/
 * 预览区同步缩小，落点因此只变大不变小。
 *
 * 只在 App 内启用；桌面留给人自己拖分隔条。
 */
export function useDropZoneBoost(): void {
	useEffect(() => {
		if (!isAndroidUI()) return;

		const setDragging = ({ dragging }: { dragging: boolean }) => {
			const root = document.documentElement;
			if (dragging) root.setAttribute("data-mw-dragging", "1");
			else root.removeAttribute("data-mw-dragging");
		};

		const handleDragStart = (event: DragEvent) => {
			setDragging({ dragging: true });

			const source = event.target as HTMLElement | null;
			if (!source?.closest('[draggable="true"]')) return;
			// 时间线内部的片段拖拽不能动布局：轨道会整块挪到手指底下，落点跟着漂。
			if (source.closest("[data-mw-timeline]")) return;

			const panel = mwPanelHandle("timeline").current;
			const dropZone = document.querySelector("[data-mw-timeline]");
			if (!panel || !dropZone) return;
			if (dropZone.getBoundingClientRect().height >= MIN_DROP_ZONE_HEIGHT_PX)
				return;
			if (panel.getSize() >= BOOST_TIMELINE_SIZE_PERCENT) return;

			// 工程区强制显示，直接改比例就行，不涉及收起状态。
			resizeMwPanel("timeline", BOOST_TIMELINE_SIZE_PERCENT);
		};

		const handleDragEnd = () => setDragging({ dragging: false });

		// 捕获阶段先于元素自己的 React onDragStart：扩容在第一次 dragover 计算落点
		// 之前就已经完成，手指不会先落到旧尺寸上再跳一格。
		document.addEventListener("dragstart", handleDragStart, true);
		document.addEventListener("dragend", handleDragEnd);
		document.addEventListener("drop", handleDragEnd);
		// 被系统手势掐断的拖拽不补 dragend（同 draggable-item 的兜底），下次按下时清标记。
		document.addEventListener("pointerdown", handleDragEnd, true);

		return () => {
			document.removeEventListener("dragstart", handleDragStart, true);
			document.removeEventListener("dragend", handleDragEnd);
			document.removeEventListener("drop", handleDragEnd);
			document.removeEventListener("pointerdown", handleDragEnd, true);
			setDragging({ dragging: false });
		};
	}, []);
}
