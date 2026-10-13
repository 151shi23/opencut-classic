import { describe, expect, test } from "bun:test";
import { edgeExtrapolationMode, foldPeriodicTime } from "@/animation/extrapolation";
import type { ScalarAnimationChannel } from "@/animation/types";

/*
 * 这个模块只有类型导入，所以能在 `bun test` 里跑真代码 ——
 * `interpolation.ts` 本身 runtime 引 `@/wasm`，那个包在 bun 下起不来。
 */

function channel({
	span,
	extrapolation,
}: {
	span: number;
	extrapolation?: ScalarAnimationChannel["extrapolation"];
}): ScalarAnimationChannel {
	return {
		keys: [
			{
				id: "k0",
				time: 0,
				value: 0,
				segmentToNext: "linear",
				tangentMode: "auto",
			},
			{
				id: "k1",
				time: span,
				value: 100,
				segmentToNext: "linear",
				tangentMode: "auto",
			},
		],
		...(extrapolation ? { extrapolation } : {}),
	};
}

describe("keyframe extrapolation", () => {
	test("hold and linear leave the time alone", () => {
		expect(
			foldPeriodicTime({
				channel: channel({ span: 100 }),
				time: 250,
			}),
		).toBe(250);
		expect(
			foldPeriodicTime({
				channel: channel({
					span: 100,
					extrapolation: { before: "linear", after: "linear" },
				}),
				time: 250,
			}),
		).toBe(250);
	});

	test("loop wraps the tail back onto the channel span", () => {
		const looping = channel({
			span: 100,
			extrapolation: { before: "loop", after: "loop" },
		});
		expect(foldPeriodicTime({ channel: looping, time: 100 })).toBe(100);
		expect(foldPeriodicTime({ channel: looping, time: 200 })).toBe(100);
		expect(foldPeriodicTime({ channel: looping, time: 150 })).toBe(50);
		expect(foldPeriodicTime({ channel: looping, time: 250 })).toBe(50);
		// 首帧之前同样是周期的，而且不能出现负时间
		expect(foldPeriodicTime({ channel: looping, time: -30 })).toBe(70);
	});

	test("pingPong walks the span forward then backward", () => {
		const bouncing = channel({
			span: 100,
			extrapolation: { before: "pingPong", after: "pingPong" },
		});
		expect(foldPeriodicTime({ channel: bouncing, time: 50 })).toBe(50);
		expect(foldPeriodicTime({ channel: bouncing, time: 150 })).toBe(50);
		expect(foldPeriodicTime({ channel: bouncing, time: 100 })).toBe(100);
		expect(foldPeriodicTime({ channel: bouncing, time: 200 })).toBe(0);
		expect(foldPeriodicTime({ channel: bouncing, time: 250 })).toBe(50);
	});

	test("a degenerate span has nothing to repeat", () => {
		expect(
			foldPeriodicTime({
				channel: channel({
					span: 0,
					extrapolation: { before: "loop", after: "loop" },
				}),
				time: 500,
			}),
		).toBe(500);
	});

	test("loop never reaches the boundary extrapolator", () => {
		expect(edgeExtrapolationMode({ mode: "loop" })).toBe("hold");
		expect(edgeExtrapolationMode({ mode: "pingPong" })).toBe("hold");
		expect(edgeExtrapolationMode({ mode: "linear" })).toBe("linear");
	});
});
