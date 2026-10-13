import type {
	ElementAnimations,
	MaskParamPath,
} from "@/animation/types";
import type { ParamValues } from "@/params";
import { removeElementKeyframe } from "./keyframes";
import { resolveAnimationPathValueAtTime } from "./resolve";

/*
 * 遮罩参数的关键帧通道。
 *
 * 路径 `masks.<maskId>.params.<key>` —— 和特效那套同构，因为遮罩也是"元素上挂着
 * 若干带 id 的子对象，每个子对象有一堆参数"。用 maskId 而不是下标：下标会因为
 * 删遮罩 / 调顺序而错位，那样动画会莫名其妙套到另一个遮罩上。
 */

export const MASK_PARAM_PATH_PREFIX = "masks.";
export const MASK_PARAM_PATH_SUFFIX = ".params.";

export function buildMaskParamPath({
	maskId,
	paramKey,
}: {
	maskId: string;
	paramKey: string;
}): MaskParamPath {
	return `${MASK_PARAM_PATH_PREFIX}${maskId}${MASK_PARAM_PATH_SUFFIX}${paramKey}`;
}

export function isMaskParamPath(
	propertyPath: string,
): propertyPath is MaskParamPath {
	return (
		propertyPath.startsWith(MASK_PARAM_PATH_PREFIX) &&
		propertyPath.includes(MASK_PARAM_PATH_SUFFIX)
	);
}

export function parseMaskParamPath({
	propertyPath,
}: {
	propertyPath: string;
}): { maskId: string; paramKey: string } | null {
	if (!isMaskParamPath(propertyPath)) {
		return null;
	}

	const withoutPrefix = propertyPath.slice(MASK_PARAM_PATH_PREFIX.length);
	const separatorIndex = withoutPrefix.indexOf(MASK_PARAM_PATH_SUFFIX);
	if (separatorIndex <= 0) {
		return null;
	}

	const maskId = withoutPrefix.slice(0, separatorIndex);
	const paramKey = withoutPrefix.slice(
		separatorIndex + MASK_PARAM_PATH_SUFFIX.length,
	);
	if (!maskId || !paramKey) {
		return null;
	}

	return { maskId, paramKey };
}

export function resolveMaskParamsAtTime({
	maskId,
	params,
	animations,
	localTime,
}: {
	maskId: string;
	params: ParamValues;
	animations: ElementAnimations | undefined;
	localTime: number;
}): ParamValues {
	// 没有动画数据时一次都不必修：遮罩每帧都要走这里，别白造一个新对象
	if (!animations || Object.keys(animations).length === 0) {
		return params;
	}

	const safeLocalTime = Math.max(0, localTime);
	const resolved: ParamValues = {};

	for (const [paramKey, staticValue] of Object.entries(params)) {
		const path = buildMaskParamPath({ maskId, paramKey });
		resolved[paramKey] = animations[path]
			? resolveAnimationPathValueAtTime({
					animations,
					propertyPath: path,
					localTime: safeLocalTime,
					fallbackValue: staticValue,
				})
			: staticValue;
	}

	return resolved;
}

export function removeMaskParamKeyframe({
	animations,
	maskId,
	paramKey,
	keyframeId,
}: {
	animations: ElementAnimations | undefined;
	maskId: string;
	paramKey: string;
	keyframeId: string;
}): ElementAnimations | undefined {
	return removeElementKeyframe({
		animations,
		propertyPath: buildMaskParamPath({ maskId, paramKey }),
		keyframeId,
	});
}
