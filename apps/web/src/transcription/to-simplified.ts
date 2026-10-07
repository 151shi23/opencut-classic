import {
	SIMPLIFIED_CHARS,
	TRADITIONAL_CHARS,
} from "./generated/t2s-characters";

/*
 * 按码点建表：表里含生僻字（代理对），用 charAt 逐格会把它拆成两个无效码元，
 * 两边都 [...str] 展开成码点数组，位置才对得上。
 */
const FROM = [...TRADITIONAL_CHARS];
const TO = [...SIMPLIFIED_CHARS];

const map = new Map<string, string>();
for (let i = 0; i < FROM.length; i++) map.set(FROM[i], TO[i]);

/** 把 Whisper 的繁体输出折成简体，表里没有的字原样返回。 */
export function toSimplified(text: string): string {
	let out = "";
	for (const char of text) {
		out += map.get(char) ?? char;
	}
	return out;
}
