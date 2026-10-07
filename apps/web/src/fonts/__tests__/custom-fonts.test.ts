import { describe, expect, it } from "bun:test";
import {
	fontFamilyFromFileName,
	isSupportedFontFile,
	isTrueTypeCollection,
} from "../custom-fonts";

const bytes = (text: string): Uint8Array =>
	new Uint8Array([...text].map((c) => c.codePointAt(0) ?? 0));

describe("isSupportedFontFile", () => {
	it("accepts the four single-face formats", () => {
		for (const name of ["a.ttf", "A.OTF", "x.woff", "x.woff2"]) {
			expect(isSupportedFontFile({ fileName: name })).toBe(true);
		}
	});

	it("rejects collections and non-fonts", () => {
		expect(isSupportedFontFile({ fileName: "msyh.ttc" })).toBe(false);
		expect(isSupportedFontFile({ fileName: "song.dfont" })).toBe(false);
		expect(isSupportedFontFile({ fileName: "README" })).toBe(false);
	});
});

describe("isTrueTypeCollection", () => {
	it("sniffs the ttcf magic even when the file is renamed to .ttf", () => {
		// 用户会把字体集改名成 .ttf 再传上来，只看后缀拦不住，
		// 而 FontFace 收到集合是构造时就抛，报错很难懂
		expect(isTrueTypeCollection({ bytes: bytes("ttcf\x00\x01\x00\x00") })).toBe(
			true,
		);
		expect(isTrueTypeCollection({ bytes: bytes("\x00\x01\x00\x00") })).toBe(
			false,
		);
		expect(isTrueTypeCollection({ bytes: new Uint8Array(0) })).toBe(false);
	});
});

describe("fontFamilyFromFileName", () => {
	it("turns a file name into a readable family", () => {
		expect(fontFamilyFromFileName({ fileName: "SimHei.ttf" })).toBe("SimHei");
		expect(fontFamilyFromFileName({ fileName: "my_font-bold.TTF" })).toBe(
			"my font bold",
		);
		expect(fontFamilyFromFileName({ fileName: "思源黑体.otf" })).toBe("思源黑体");
	});

	it("drops names that are only an extension", () => {
		expect(fontFamilyFromFileName({ fileName: ".ttf" })).toBe("");
		expect(fontFamilyFromFileName({ fileName: "   .otf" })).toBe("");
	});
});
