"use client";

import { useSyncExternalStore, type RefObject } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { cn } from "@/utils/ui";
import { isAndroidUI } from "@/android/detect";

/**
 * 手机上只有「素材」和「属性」两块侧栏值得收起来腾地方。预览和工程区是编辑器的
 * 主体，收掉就没有可编辑的东西了（连工程区工具栏都会一起没了），所以强制显示。
 */
export const MW_PANEL_KEYS = ["tools", "properties"] as const;

export type MwPanelKey = (typeof MW_PANEL_KEYS)[number];

/** 可收起的侧栏，外加只挂命令式句柄的强制显示区。 */
export type MwLayoutPanel = MwPanelKey | "timeline";

export const MW_PANEL_LABELS: Record<MwPanelKey, string> = {
	tools: "素材",
	properties: "属性",
};

const NOTHING_HIDDEN: Record<MwPanelKey, boolean> = {
	tools: false,
	properties: false,
};

// 面板是 uncontrolled 的（只吃 defaultSize），命令式 ref 放在模块级：
// 开关在工程区工具栏、面板在布局里，两边要拿到同一组句柄。
const handles: Record<
	MwLayoutPanel,
	RefObject<ImperativePanelHandle | null>
> = {
	tools: { current: null },
	properties: { current: null },
	timeline: { current: null },
};

let hidden = NOTHING_HIDDEN;
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
}

export function useMwPanelsHidden(): Record<MwPanelKey, boolean> {
	return useSyncExternalStore(
		subscribe,
		() => hidden,
		() => NOTHING_HIDDEN,
	);
}

export function markMwPanelHidden(key: MwPanelKey, value: boolean): void {
	if (hidden[key] === value) return;
	hidden = { ...hidden, [key]: value };
	for (const fn of listeners) fn();
}

export function mwPanelHandle(
	key: MwLayoutPanel,
): RefObject<ImperativePanelHandle | null> {
	return handles[key];
}

export function toggleMwPanel(key: MwPanelKey): void {
	const panel = handles[key].current;
	if (!panel) return;
	if (panel.isCollapsed()) panel.expand();
	else panel.collapse();
}

/** 直接改比例（拖素材时扩容工程区用），跟收起状态无关。 */
export function resizeMwPanel(key: MwLayoutPanel, size: number): void {
	handles[key].current?.resize(size);
}

/** 只有侧栏给 collapsible；强制显示区只挂句柄。 */
export function mwPanelProps(key: MwLayoutPanel) {
	if (key !== "tools" && key !== "properties") {
		return { ref: handles[key] };
	}

	return {
		ref: handles[key],
		collapsible: true,
		collapsedSize: 0,
		onCollapse: () => markMwPanelHidden(key, true),
		onExpand: () => markMwPanelHidden(key, false),
	};
}

export function MwPanelToolbarButtons() {
	const hiddenPanels = useMwPanelsHidden();
	if (!isAndroidUI()) return null;

	return (
		<div className="mr-1 flex shrink-0 items-center gap-1" data-mw-panel-bar="">
			{MW_PANEL_KEYS.map((key) => {
				const isHidden = hiddenPanels[key];
				return (
					<button
						key={key}
						type="button"
						data-mw-panel-toggle={key}
						aria-pressed={isHidden}
						onClick={() => toggleMwPanel(key)}
						className={cn(
							"h-6 rounded-sm border px-1.5 text-[11px] leading-none",
							isHidden
								? "bg-primary text-primary-foreground border-primary"
								: "bg-background text-muted-foreground",
						)}
					>
						{MW_PANEL_LABELS[key]}
					</button>
				);
			})}
		</div>
	);
}
