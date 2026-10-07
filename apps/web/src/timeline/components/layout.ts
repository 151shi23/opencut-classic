import type { TrackType } from "@/timeline";

/*
 * 安卓移植补丁：手机横屏只有约 390px 高，时间轴分到的一半里原本只放得下
 * 1.5 条轨道。命中测试（selection-hit-testing / drop-target）用的就是这份
 * 常量，所以只改这里，不要用 CSS 单方面压行高，否则点击坐标和画面对不上。
 */
export const TIMELINE_TRACK_HEIGHTS_PX: Record<TrackType, number> = {
	video: 46,
	text: 22,
	audio: 34,
	graphic: 22,
	effect: 22,
} as const;

export const KEYFRAME_LANE_HEIGHT_PX = 16;
export const KEYFRAME_DIAMOND_SIZE_PX = 12;
export const EXPANDED_GROUP_HEADER_HEIGHT_PX = 16;

export const TIMELINE_TRACK_GAP_PX = 3;
export const TIMELINE_TRACK_LABELS_COLUMN_WIDTH_PX = 92;
export const TIMELINE_RULER_HEIGHT_PX = 20;
export const TIMELINE_BOOKMARK_ROW_HEIGHT_PX = 16;
export const TIMELINE_SCROLLBAR_SIZE_PX = 12;
export const TIMELINE_CONTENT_TOP_PADDING_PX = 2;
