import type {
	AnimationPath,
	ElementAnimations,
} from "@/animation/types";
import type { TimelineTrack } from "@/timeline";
import { getElementKeyframes } from "@/animation";
import { KEYFRAME_LANE_HEIGHT_PX } from "./layout";

export interface ExpandedRow {
	propertyPath: AnimationPath;
	label: string;
}

interface PropertyGroupDefinition {
	matchesPath: (path: AnimationPath) => boolean;
}

// 文字元素上用裸 key 打关键帧的参数（见 animation/types.ts 的注释）
const ANIMATED_TEXT_PATHS = new Set([
	"fontSize",
	"letterSpacing",
	"lineHeight",
	"gradientAngle",
	"stroke.width",
	"shadow.blur",
	"shadow.offsetX",
	"shadow.offsetY",
]);

const PROPERTY_GROUPS: PropertyGroupDefinition[] = [
	{ matchesPath: (path) => path.startsWith("transform.") || path === "opacity" },
	{ matchesPath: (path) => path === "volume" || path === "color" },
	{ matchesPath: (path) => path.startsWith("background.") },
	{ matchesPath: (path) => ANIMATED_TEXT_PATHS.has(path) },
	{ matchesPath: (path) => path.startsWith("masks.") },
	{ matchesPath: (path) => path.startsWith("params.") },
	{ matchesPath: (path) => path.startsWith("effects.") },
];

const PROPERTY_LABELS: Partial<Record<string, string>> = {
	"transform.positionX": "Position X",
	"transform.positionY": "Position Y",
	"transform.scaleX": "Scale X",
	"transform.scaleY": "Scale Y",
	"transform.rotate": "Rotation",
	opacity: "Opacity",
	volume: "Volume",
	color: "Color",
	fontSize: "Font Size",
	letterSpacing: "Letter Spacing",
	lineHeight: "Line Height",
	gradientAngle: "Gradient Angle",
	"stroke.width": "Stroke Width",
	"shadow.blur": "Shadow Blur",
	"shadow.offsetX": "Shadow Offset X",
	"shadow.offsetY": "Shadow Offset Y",
	"background.color": "BG Color",
	"background.paddingX": "BG Pad X",
	"background.paddingY": "BG Pad Y",
	"background.offsetX": "BG Offset X",
	"background.offsetY": "BG Offset Y",
	"background.cornerRadius": "Corner Radius",
};

export function getPropertyLabel(path: AnimationPath): string {
	if (PROPERTY_LABELS[path]) return PROPERTY_LABELS[path];
	if (path.startsWith("params.")) return path.slice("params.".length);
	if (path.startsWith("masks.")) {
		// 路径里带的是 maskId（uuid），能看懂的只有最后那段参数名；
		// 首字母大写后正好对上遮罩面板那份标签，汉化表也按整句能查到
		const key = path.slice(path.lastIndexOf(".") + 1);
		return key.charAt(0).toUpperCase() + key.slice(1);
	}
	if (path.startsWith("effects.")) {
		const parts = path.split(".");
		return parts[parts.length - 1];
	}
	return path;
}

export function getExpandedRows({
	animations,
}: {
	animations: ElementAnimations | undefined;
}): ExpandedRow[] {
	const keyframes = getElementKeyframes({ animations });
	const propertyPaths = [...new Set(keyframes.map((kf) => kf.propertyPath))];
	if (propertyPaths.length === 0) return [];

	const rows: ExpandedRow[] = [];

	for (const group of PROPERTY_GROUPS) {
		const groupPaths = propertyPaths.filter((path) =>
			group.matchesPath(path),
		);
		for (const path of groupPaths) {
			rows.push({ propertyPath: path, label: getPropertyLabel(path) });
		}
	}

	return rows;
}

export function getExpansionHeight({ rows }: { rows: ExpandedRow[] }): number {
	return rows.length * KEYFRAME_LANE_HEIGHT_PX;
}

export function computeTrackExpansionHeight({
	track,
	expandedElementIds,
}: {
	track: TimelineTrack;
	expandedElementIds: Set<string>;
}): number {
	let maxHeight = 0;
	for (const element of track.elements) {
		if (!expandedElementIds.has(element.id)) continue;
		const rows = getExpandedRows({ animations: element.animations });
		maxHeight = Math.max(maxHeight, getExpansionHeight({ rows }));
	}
	return maxHeight;
}

export function getTrackExpandedRows({
	track,
	expandedElementIds,
}: {
	track: TimelineTrack;
	expandedElementIds: Set<string>;
}): ExpandedRow[] {
	let maxHeight = 0;
	let maxRows: ExpandedRow[] = [];

	for (const element of track.elements) {
		if (!expandedElementIds.has(element.id)) continue;
		const rows = getExpandedRows({ animations: element.animations });
		const height = getExpansionHeight({ rows });
		if (height > maxHeight) {
			maxHeight = height;
			maxRows = rows;
		}
	}

	return maxRows;
}
