import type { FontAtlas } from "@/fonts/types";
import { SYSTEM_FONTS } from "@/fonts/system-fonts";
import { isCustomFontFamily } from "@/fonts/custom-fonts";

const GOOGLE_FONTS_CSS = "https://fonts.googleapis.com/css2";
const FONT_ATLAS_PATH = "/fonts/font-atlas.json";
const FONT_CHUNK_PATH_PREFIX = "/fonts/font-chunk-";

const fullLoaded = new Set<string>();

let cachedAtlas: FontAtlas | null = null;
let atlasFetchPromise: Promise<FontAtlas | null> | null = null;

function encodeGoogleFontsFamily(family: string): string {
	return family.replace(/ /g, "+");
}

export function getCachedFontAtlas(): FontAtlas | null {
	return cachedAtlas;
}

export function clearFontAtlasCache(): void {
	cachedAtlas = null;
	atlasFetchPromise = null;
	fullLoaded.clear();
}

export function loadFontAtlas(): Promise<FontAtlas | null> {
	if (cachedAtlas) return Promise.resolve(cachedAtlas);
	if (atlasFetchPromise) return atlasFetchPromise;

	atlasFetchPromise = fetch(FONT_ATLAS_PATH)
		.then(async (response) => {
			if (!response.ok) return null;
			const data: FontAtlas = await response.json();
			cachedAtlas = data;
			preloadChunkImages({ atlas: data });
			return data;
		})
		.catch(() => null);

	return atlasFetchPromise;
}

function preloadChunkImages({ atlas }: { atlas: FontAtlas }): void {
	const maxChunk = Math.max(
		...Object.values(atlas.fonts).map((entry) => entry.ch),
	);
	for (let i = 0; i <= maxChunk; i++) {
		// hint browser to preload chunk images without blocking
		const img = new Image();
		img.src = `${FONT_CHUNK_PATH_PREFIX}${i}.avif`;
	}
}

export async function loadFullFont({
	family,
	weights = [400, 700],
}: {
	family: string;
	weights?: number[];
}): Promise<void> {
	if (fullLoaded.has(family)) return;

	const url = `${GOOGLE_FONTS_CSS}?family=${encodeGoogleFontsFamily(family)}:wght@${weights.join(";")}&display=swap`;
	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.href = url;
	document.head.appendChild(link);
	await new Promise<void>((resolve) => {
		link.addEventListener("load", () => resolve(), { once: true });
		link.addEventListener("error", () => resolve(), { once: true });
	});
	const loaded = await Promise.all(
		weights.map((weight) =>
			document.fonts.load(`${weight} 16px "${family.replace(/"/g, '\\"')}"`),
		),
	);
	/*
	 * 只有真的拿到 FontFace 才算"加载过了"。以前 error 事件和 load 一样 resolve，
	 * 拿不到也写进 fullLoaded，于是国内网络访问不了 fonts.googleapis.com 时，
	 * 用户选了字体 → 请求失败 → 被永久记成"已加载" → 画面永远用系统字体，
	 * 而且再也不重试，看起来就像"这个字体没效果"。
	 * 注意别用 document.fonts.check() 判断可用性：它对根本不存在的族也返回 true。
	 */
	if (loaded.some((faces) => faces.length > 0)) {
		fullLoaded.add(family);
	}
}

export async function loadFonts({
	families,
}: {
	families: string[];
}): Promise<void> {
	// 本地导入的字体不在这份名单里问 Google：那个 family 名是文件名，
	// Google 上根本没有，请求过去只会拿到一条废响应
	const googleFonts = families.filter(
		(family) =>
			!SYSTEM_FONTS.has(family) && !isCustomFontFamily({ family }),
	);
	await Promise.all(googleFonts.map((family) => loadFullFont({ family })));
}
