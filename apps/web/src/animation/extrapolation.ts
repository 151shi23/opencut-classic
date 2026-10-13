import type {
	ChannelExtrapolationMode,
	ScalarAnimationChannel,
} from "@/animation/types";

/*
 * 关键帧通道在"首帧之前 / 尾帧之后"怎么取值。
 *
 * 单独放一个文件是为了能写单测：`interpolation.ts` runtime 引 `@/wasm`，
 * 而 `opencut-wasm` 在 bun test 下起不来（见仓库里那几条既有失败）。
 * 这里只有类型导入，所以测得到真代码而不是替身。
 */

function positiveMod({
	value,
	period,
}: {
	value: number;
	period: number;
}): number {
	const rest = value % period;
	return rest < 0 ? rest + period : rest;
}

/**
 * 循环 / 乒乓：把窗口外的时间折回 [首帧, 尾帧] 再照常求值。
 *
 * 周期取首尾关键帧之间的长度，所以一段 1 秒的呼吸就能撑满 8 秒素材，
 * 不用真的往时间轴上补 16 个点 —— 数据量、曲线编辑、导出采样都不变。
 * 只有一个关键帧、或首尾同刻（span 0）时没什么可循环的，原样返回。
 */
export function foldPeriodicTime({
	channel,
	time,
}: {
	channel: ScalarAnimationChannel;
	time: number;
}): number {
	const keys = channel.keys;
	const firstKey = keys[0];
	const lastKey = keys[keys.length - 1];
	if (!firstKey || !lastKey) {
		return time;
	}

	const mode: ChannelExtrapolationMode =
		time < firstKey.time
			? (channel.extrapolation?.before ?? "hold")
			: (channel.extrapolation?.after ?? "hold");
	if (mode !== "loop" && mode !== "pingPong") {
		return time;
	}

	const span = lastKey.time - firstKey.time;
	if (span <= 0) {
		return time;
	}

	if (mode === "loop") {
		const offset = positiveMod({ value: time - firstKey.time, period: span });
		/*
		 * 落在整周期边界上（offset 0）时不能折回首帧 —— 那样每一圈的最后一帧会
		 * 从尾值闪回首值。折成"上一圈的末尾"，边界就连续了：
		 * 起点仍是首帧，之后每个周期末尾都是尾帧。
		 */
		if (offset === 0 && time > firstKey.time) {
			return lastKey.time;
		}
		return firstKey.time + offset;
	}

	// 乒乓：一个来回是 2×span，前半正着走、后半倒着走
	const phase = positiveMod({ value: time - firstKey.time, period: span * 2 });
	return phase <= span ? firstKey.time + phase : firstKey.time + (span * 2 - phase);
}

/** 折叠之后不可能再用 loop/pingPong，边界外推只认 hold 和 linear */
export function edgeExtrapolationMode({
	mode,
}: {
	mode: ChannelExtrapolationMode;
}): "hold" | "linear" {
	return mode === "loop" || mode === "pingPong" ? "hold" : mode;
}
