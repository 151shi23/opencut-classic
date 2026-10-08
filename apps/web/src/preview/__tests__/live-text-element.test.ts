import { describe, expect, it } from "bun:test";
import { findLiveTextElement } from "../live-text-element";

const textElement = (id: string, content: string) => ({
	id,
	type: "text" as const,
	params: { content },
});

const scene = ({
	main = [],
	overlay = [],
	audio = [],
}: {
	main?: unknown[];
	overlay?: unknown[];
	audio?: unknown[];
}) =>
	({
		main: { id: "main", elements: main },
		overlay: overlay.map((elements, i) => ({ id: `o${i}`, elements })),
		audio: audio.map((elements, i) => ({ id: `a${i}`, elements })),
	}) as never;

describe("findLiveTextElement", () => {
	it("reads the current element instead of a captured snapshot", () => {
		// 回归用例：浮层以前拿的是双击那一刻的对象，换一个字体触发重渲染之后，
		// 它按旧对象把文字和字体写回去 —— 手机上就是"改完字体打不进字"
		const found = findLiveTextElement({
			tracks: scene({ main: [textElement("e1", "新内容")] }),
			elementId: "e1",
		});
		expect(found).not.toBeNull();
		expect(found?.params.content).toBe("新内容");
	});

	it("looks through overlay and audio tracks as well", () => {
		const found = findLiveTextElement({
			tracks: scene({ overlay: [[textElement("e2", "覆盖轨上的字")]] }),
			elementId: "e2",
		});
		expect(found?.id).toBe("e2");
	});

	it("refuses a non-text element that happens to share the id", () => {
		expect(
			findLiveTextElement({
				tracks: scene({ main: [{ id: "e3", type: "video" }] }),
				elementId: "e3",
			}),
		).toBeNull();
	});

	it("returns null once the element is gone", () => {
		expect(
			findLiveTextElement({ tracks: scene({ main: [] }), elementId: "e4" }),
		).toBeNull();
	});
});
