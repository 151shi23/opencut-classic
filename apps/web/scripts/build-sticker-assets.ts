import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

/*
 * 生成内置贴纸资产：public/stickers/<set>/<name>.svg + public/stickers/<set>/index.json。
 *
 * 数据来源（都是开源、可溯源，不手写查找表）：
 *   · 图形本体：Iconify 的 @iconify-json/<set> 离线包（每套自带 license 元数据），
 *     走 jsDelivr 逐文件取，版本钉死在下面的 SETS 里；
 *   · 码点 → 图标名：同包里的 chars.json；
 *   · 中文搜索词：Unicode CLDR 的 annotations/zh.xml + annotations_derived/zh.xml
 *     （Unicode-3.0 许可），按码点给中文名。所以 emoji 三套用中文搜是准的；
 *     solar / thesvg-color 这类图标没有码点，只能按英文名搜，这一点如实写进 manifest。
 *
 *   bun scripts/build-sticker-assets.ts
 *
 * 落盘用真实静态文件，不用 blob:/data: URI —— 贴纸的 src 会存进工程（IndexedDB），
 * blob URL 换个会话就失效，重开工程贴纸会全空。
 */

const CACHE = resolve("E:/mw-scratch/stickers/raw");
const OUT_ROOT = resolve(import.meta.dirname, "..", "public", "stickers");

interface SetSpec {
	prefix: string;
	version: string;
	/** 面板里的显示名（英文源串，中文由 zh-dictionary 注入） */
	label: string;
	/** 是否期望有中文词（emoji 系） */
	emoji: boolean;
	/**
	 * 码点表的来源包，默认用自己包里的 chars.json。fluent-emoji 那份是空的（0 条），
	 * 但它和 fluent-emoji-flat 同出 Microsoft/fluentui-emoji、图标名 3174 个里 3139 个
	 * 对得上（99% 实测），所以借 flat 的表拿中文名。
	 */
	charsFrom?: string;
}

const SETS: SetSpec[] = [
	{ prefix: "twemoji", version: "1.2.5", label: "Twemoji", emoji: true },
	{
		prefix: "fluent-emoji-flat",
		version: "1.2.6",
		label: "Fluent Flat",
		emoji: true,
	},
	{
		prefix: "fluent-emoji",
		version: "1.2.7",
		label: "Fluent Color",
		emoji: true,
		charsFrom: "fluent-emoji-flat",
	},
	{ prefix: "noto", version: "1.2.9", label: "Noto", emoji: true },
	{ prefix: "solar", version: "1.2.13", label: "Solar", emoji: false },
	{ prefix: "thesvg-color", version: "1.2.15", label: "theSVG", emoji: false },
];

const CLDR_FILES: Array<{ url: string; cache: string; optional: boolean }> = [
	{
		url: "https://cdn.jsdelivr.net/gh/unicode-org/cldr@main/common/annotations/zh.xml",
		cache: "cldr-zh-0.xml",
		optional: false,
	},
	{
		url: "https://cdn.jsdelivr.net/gh/unicode-org/cldr@main/common/annotationsDerived/zh.xml",
		cache: "cldr-zh-1.xml",
		// 派生名（如「手机」这类补出来的叫法）能显著提高搜索命中，但少了也能跑，
		// 所以取不到只降级，不让整条生成命令挂掉
		optional: true,
	},
];

async function fetchText(url: string, cacheName: string): Promise<string> {
	const target = join(CACHE, cacheName);
	if (existsSync(target)) return await Bun.file(target).text();
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
	const text = await res.text();
	await mkdir(CACHE, { recursive: true });
	await writeFile(target, text);
	return text;
}

/*
 * tarball 解包不依赖外部 tar：msys/Git 的 tar 在 Windows 路径上连环出问题（把
 * "E:/x" 当 host:path、把反斜杠转义搅坏），而 npm 的 tgz 结构就是 512 字节头 +
 * 数据块，自己读 50 行就够，换来任何机器都跑得通。
 */
function readCString(block: Buffer, start: number, length: number): string {
	const slice = block.subarray(start, start + length);
	const end = slice.indexOf(0);
	return slice.subarray(0, end === -1 ? slice.length : end).toString("utf8").trim();
}

function untar(gzipped: Buffer, wanted: string[]): Map<string, Buffer> {
	const buffer = gunzipSync(gzipped);
	const out = new Map<string, Buffer>();
	let offset = 0;
	let pendingLongName: string | null = null;

	while (offset + 512 <= buffer.length) {
		const header = buffer.subarray(offset, offset + 512);
		// 归档结尾是两个全零块
		if (header.every((byte) => byte === 0)) break;

		const rawName = readCString(header, 0, 100);
		const prefix = readCString(header, 345, 157);
		const size = parseInt(readCString(header, 124, 12) || "0", 8);
		const typeFlag = header[156];
		offset += 512;

		// GNU long name：真正的名字在这条特殊条目的数据里，属于下一条
		if (typeFlag === 0x4c /* 'L' */) {
			pendingLongName = buffer.subarray(offset, offset + size).toString("utf8").replace(/\0+$/, "");
			offset += Math.ceil(size / 512) * 512;
			continue;
		}
		if (typeFlag === 0x35 /* '5' 目录 */) continue;

		const fullName = pendingLongName ?? (prefix ? `${prefix}/${rawName}` : rawName);
		pendingLongName = null;
		const base = fullName.split("/").pop() ?? fullName;
		if (wanted.includes(base)) {
			out.set(base, buffer.subarray(offset, offset + size));
		}
		offset += Math.ceil(size / 512) * 512;
	}
	return out;
}

async function readPackageFile(
	prefix: string,
	version: string,
	file: string,
): Promise<string> {
	const dir = join(CACHE, `${prefix}@${version}`);
	const target = join(dir, file);
	if (!existsSync(target)) {
		const tgzPath = join(CACHE, `${prefix}@${version}.tgz`);
		if (!existsSync(tgzPath)) {
			const url = `https://registry.npmjs.org/@iconify-json/${prefix}/-/${prefix}-${version}.tgz`;
			const res = await fetch(url);
			if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
			await mkdir(CACHE, { recursive: true });
			await writeFile(tgzPath, new Uint8Array(await res.arrayBuffer()));
		}
		const tgz = await Bun.file(tgzPath).bytes();
		const extracted = untar(Buffer.from(tgz), ["icons.json", "chars.json", "info.json"]);
		if (extracted.size === 0) throw new Error(`${prefix}@${version} 里没解出任何文件`);
		await mkdir(dir, { recursive: true });
		for (const [name, content] of extracted) {
			await writeFile(join(dir, name), content);
		}
	}
	return await Bun.file(target).text();
}

async function readPackageJson<T>(
	prefix: string,
	version: string,
	file: string,
): Promise<T> {
	return JSON.parse(await readPackageFile(prefix, version, file)) as T;
}

function hexOf(character: string): string {
	return [...character]
		.map((part) => part.codePointAt(0)?.toString(16) ?? "")
		.join("-");
}

/** CLDR annotation：`<annotation cp="😀" type="tts">脸; grinning</annotation>` */
function parseCldrAnnotations(xml: string): Map<string, string[]> {
	const map = new Map<string, string[]>();
	const pattern = /<annotation cp="([^"]+)"[^>]*>([^<]*)<\/annotation>/g;
	for (const match of xml.matchAll(pattern)) {
		const hex = hexOf(match[1] ?? "");
		if (!hex) continue;
		const terms = (match[2] ?? "")
			.split(";")
			.map((term) => term.trim())
			.filter(Boolean);
		if (terms.length === 0) continue;
		const merged = new Set([...(map.get(hex) ?? []), ...terms]);
		map.set(hex, [...merged]);
	}
	return map;
}

interface SetInfo {
	prefix: string;
	name?: string;
	total?: number;
	author?: { name?: string; url?: string };
	license?: { title?: string; spdx?: string; url?: string };
}

interface IconDoc {
	prefix: string;
	width?: number;
	height?: number;
	icons: Record<string, { body: string; width?: number; height?: number }>;
	aliases?: Record<string, { parent: string } | { parents: string[] }>;
}

interface ManifestEntry {
	name: string;
	label: string;
	zh: string[];
	en: string[];
}

async function buildSet(spec: SetSpec, zhByHex: Map<string, string[]>) {
	const icons = await readPackageJson<IconDoc>(spec.prefix, spec.version, "icons.json");
	const charsPrefix = spec.charsFrom ?? spec.prefix;
	const charsSpec = SETS.find((s) => s.prefix === charsPrefix);
	if (!charsSpec) throw new Error(`找不到码点来源包：${charsPrefix}`);
	const chars = await readPackageJson<Record<string, string>>(
		charsSpec.prefix,
		charsSpec.version,
		"chars.json",
	);
	// 署名信息（CC BY 4.0 的硬性要求）从包里原样带出来，不要手抄
	const info = await readPackageJson<SetInfo>(spec.prefix, spec.version, "info.json");
	// chars.json 是 码点 -> 名称，这里反过来用
	const hexByName = new Map<string, string>();
	for (const [hex, name] of Object.entries(chars)) hexByName.set(name, hex);

	// 别名只当搜索词，不生成文件（省掉一千多个内容重复的 svg）
	const aliasesByParent = new Map<string, string[]>();
	for (const [alias, target] of Object.entries(icons.aliases ?? {})) {
		const parents =
			"parent" in target ? [target.parent] : ("parents" in target ? target.parents : []);
		for (const parent of parents) {
			const list = aliasesByParent.get(parent) ?? [];
			list.push(alias);
			aliasesByParent.set(parent, list);
		}
	}

	const dir = join(OUT_ROOT, spec.prefix);
	await mkdir(dir, { recursive: true });

	const width = icons.width ?? 24;
	const height = icons.height ?? 24;
	const manifest: ManifestEntry[] = [];
	let bytes = 0;

	for (const [name, icon] of Object.entries(icons.icons)) {
		const w = icon.width ?? width;
		const h = icon.height ?? height;
		const svg =
			`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" ` +
			`viewBox="0 0 ${w} ${h}">${icon.body}</svg>\n`;
		await writeFile(join(dir, `${name}.svg`), svg);
		bytes += svg.length;

		const hex = hexByName.get(name);
		const zh = hex ? (zhByHex.get(hex) ?? []) : [];
		manifest.push({
			name,
			label: name.replace(/-/g, " "),
			zh,
			en: [name.replace(/-/g, " "), ...(aliasesByParent.get(name) ?? []).map((a) => a.replace(/-/g, " "))],
		});
	}

	manifest.sort((a, b) => a.name.localeCompare(b.name));
	const index = {
		prefix: spec.prefix,
		label: spec.label,
		count: manifest.length,
		withChinese: manifest.filter((m) => m.zh.length > 0).length,
		// CC BY 4.0 / MIT 的署名信息，关于页要照着这些字段列，别凭记忆写
		attribution: {
			name: info.name ?? spec.label,
			author: info.author?.name ?? "",
			authorUrl: info.author?.url ?? "",
			license: info.license?.title ?? "未知",
			licenseSpdx: info.license?.spdx ?? "",
			licenseUrl: info.license?.url ?? "",
			source: `@iconify-json/${spec.prefix}@${spec.version}`,
		},
		entries: manifest,
	};
	await writeFile(join(dir, "index.json"), JSON.stringify(index));

	console.log(
		`${spec.prefix.padEnd(17)} 文件 ${String(manifest.length).padStart(5)}  ` +
			`SVG ${(bytes / 1048576).toFixed(1)}MB  ` +
			`manifest ${(JSON.stringify(index).length / 1048576).toFixed(1)}MB  ` +
			`有中文名 ${index.withChinese}`,
	);
	return { files: manifest.length, bytes, withChinese: index.withChinese };
}

const xmls: string[] = [];
for (const source of CLDR_FILES) {
	try {
		xmls.push(await fetchText(source.url, source.cache));
	} catch (error) {
		// 派生表只是补充叫法，取不到不该拖垮主流程；主表缺了才是问题
		if (!source.optional) throw error;
		console.log(`可选源跳过：${source.url}（${String(error).slice(0, 60)}）`);
	}
}
const zhByHex = new Map<string, string[]>();
for (const xml of xmls) {
	for (const [hex, terms] of parseCldrAnnotations(xml)) {
		zhByHex.set(hex, terms);
	}
}
console.log(`CLDR 中文注释码点数: ${zhByHex.size}`);

// 可以只重生成指定的套：bun scripts/build-sticker-assets.ts fluent-emoji
const only = process.argv.slice(2);
const selected = only.length > 0 ? SETS.filter((s) => only.includes(s.prefix)) : SETS;
if (selected.length === 0) {
	throw new Error(`没有匹配的套：${only.join(",")}（可选 ${SETS.map((s) => s.prefix).join("/")}）`);
}

let files = 0;
let bytes = 0;
let zh = 0;
for (const spec of selected) {
	const result = await buildSet(spec, zhByHex);
	files += result.files;
	bytes += result.bytes;
	zh += result.withChinese;
}
console.log(
	`合计 ${files} 个 SVG，${(bytes / 1048576).toFixed(1)}MB 原始，其中 ${zh} 个带中文名`,
);
