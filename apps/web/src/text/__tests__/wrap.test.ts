import { describe, expect, test } from "bun:test";
import { wrapLine, wrapTextContent } from "@/text/wrap";

/*
 * 用一个"每个字符 1 单位"的假量宽函数：断言只跟断点位置有关，
 * 不依赖 canvas 的真实字宽，也不碰 opencut-wasm（见 memory 里那条 bun 测试边界）。
 */
const measure = ({ text }: { text: string }) => text.length;

describe("text wrapping", () => {
	test("leaves the text alone when no box width is set", () => {
		expect(
			wrapTextContent({
				content: "第一行\n第二行",
				maxWidthPx: 0,
				measure,
			}),
		).toEqual(["第一行", "第二行"]);
	});

	test("keeps hard line breaks and wraps each one separately", () => {
		expect(
			wrapTextContent({
				content: "一二三四五六\n七八九",
				maxWidthPx: 4,
				measure,
			}),
		).toEqual(["一二三四", "五六", "七八九"]);
	});

	test("breaks Chinese at character boundaries", () => {
		expect(
			wrapLine({ line: "一二三四五六七八九十", maxWidthPx: 4, measure }),
		).toEqual(["一二三四", "五六七八", "九十"]);
	});

	test("breaks Latin words at spaces, never mid-word", () => {
		expect(
			wrapLine({ line: "hello world again", maxWidthPx: 5, measure }),
		).toEqual(["hello", "world", "again"]);
	});

	test("hard-splits a single word wider than the box instead of looping", () => {
		expect(
			wrapLine({ line: "abcdefgh", maxWidthPx: 3, measure }),
		).toEqual(["abc", "def", "gh"]);
	});

	test("does not count the trailing space when choosing a break point", () => {
		// "abcd " 量出来是 5，但换行处不留白，所以能放进 4 宽的框
		expect(wrapLine({ line: "abcd efgh", maxWidthPx: 4, measure })).toEqual([
			"abcd",
			"efgh",
		]);
	});

	test("an empty line stays an empty line", () => {
		expect(wrapTextContent({ content: "", maxWidthPx: 10, measure })).toEqual([
			"",
		]);
	});
});
