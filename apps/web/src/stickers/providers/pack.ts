import { buildStickerId, parseStickerId } from "../sticker-id";
import type {
	StickerBrowseResult,
	StickerCategory,
	StickerItem,
	StickerProvider,
	StickerSearchResult,
} from "../types";

/*
 * 内置贴纸包的通用 provider。六套（twemoji / fluent-emoji-flat / fluent-emoji /
 * noto / solar / thesvg-color）形状完全一样，差别只在 prefix，所以不写六份代码。
 *
 * 资产由 `bun scripts/build-sticker-assets.ts` 生成：
 *   public/stickers/<prefix>/<name>.svg   图形本体（真实静态文件，不用 blob ——
 *   贴纸 src 会存进工程，blob URL 换个会话就失效）
 *   public/stickers/<prefix>/index.json   清单：name / label / zh[] / en[]
 * 中文搜索词来自 Unicode CLDR 的 annotations/zh.xml，按码点匹配，见生成脚本。
 */

const PACK_BASE_URL = "/stickers";

interface PackEntry {
	name: string;
	label: string;
	zh: string[];
	en: string[];
}

interface PackIndex {
	prefix: string;
	label: string;
	count: number;
	entries: PackEntry[];
}

const DEFAULT_BROWSE_LIMIT = 60;

const indexPromises = new Map<string, Promise<PackIndex>>();

function loadIndex({ prefix }: { prefix: string }): Promise<PackIndex> {
	const cached = indexPromises.get(prefix);
	if (cached) return cached;

	const promise = fetch(`${PACK_BASE_URL}/${prefix}/index.json`)
		.then((response) => {
			if (!response.ok) {
				throw new Error(`贴纸清单读取失败 ${prefix}: HTTP ${response.status}`);
			}
			return response.json() as Promise<PackIndex>;
		})
		.catch((error) => {
			// 失败不能永久缓存，否则刷新页面也救不回来
			indexPromises.delete(prefix);
			console.error(`Failed to load sticker pack ${prefix}:`, error);
			return { prefix, label: prefix, count: 0, entries: [] } satisfies PackIndex;
		});

	indexPromises.set(prefix, promise);
	return promise;
}

function buildPackUrl({
	prefix,
	name,
}: {
	prefix: string;
	name: string;
}): string {
	return `${PACK_BASE_URL}/${prefix}/${encodeURIComponent(name)}.svg`;
}

function toStickerItem({
	prefix,
	entry,
}: {
	prefix: string;
	entry: PackEntry;
}): StickerItem {
	return {
		id: buildStickerId({ providerId: prefix, providerValue: entry.name }),
		provider: prefix,
		name: entry.label,
		previewUrl: buildPackUrl({ prefix, name: entry.name }),
		metadata: { name: entry.name, zh: entry.zh },
	};
}

function normalize({ query }: { query: string }): string {
	return query.trim().toLowerCase();
}

/**
 * 中文按「包含」双向匹配：搜「笑」要能命中 CLDR 给的「笑脸; 大笑」，搜「大笑的脸」
 * 也要能命中条目「大笑」。英文同理，另外图标名（grinning-face）也当词面兜底。
 */
function matchesEntry({
	entry,
	query,
}: {
	entry: PackEntry;
	query: string;
}): boolean {
	if (!query) return true;
	for (const term of entry.zh) {
		const t = term.toLowerCase();
		if (t.includes(query) || query.includes(t)) return true;
	}
	for (const term of entry.en) {
		const t = term.toLowerCase();
		if (t.includes(query) || query.includes(t)) return true;
	}
	return false;
}

export function createPackProvider({
	prefix,
}: {
	prefix: string;
}): StickerProvider {
	return {
		id: prefix,

		async search({ query, options }): Promise<StickerSearchResult> {
			const index = await loadIndex({ prefix });
			const limit = options?.limit ?? 100;
			const normalized = normalize({ query });
			const matched = index.entries.filter((entry) =>
				matchesEntry({ entry, query: normalized }),
			);

			return {
				items: matched.slice(0, limit).map((entry) => toStickerItem({ prefix, entry })),
				total: matched.length,
				hasMore: matched.length > limit,
			};
		},

		async browse({ options }): Promise<StickerBrowseResult> {
			const index = await loadIndex({ prefix });
			const limit = options?.limit ?? DEFAULT_BROWSE_LIMIT;
			const page = Math.max(1, options?.page ?? 1);
			const start = (page - 1) * limit;

			return {
				sections: [
					{
						// id 必须稳定：store 的「加载更多」是按 id 把下一页并进同一个分区的，
						// 带页码的话每翻一页就多出一个新分区。
						id: prefix,
						title: index.label,
						layout: "grid",
						items: index.entries
							.slice(start, start + limit)
							.map((entry) => toStickerItem({ prefix, entry })),
						hasMore: start + limit < index.entries.length,
						action: {
							type: "see-all",
							category: prefix as StickerCategory,
							sectionId: prefix,
						},
					},
				],
			};
		},

		resolveUrl({ stickerId, options }): string {
			const { providerValue } = parseStickerId({ stickerId });
			const width = options?.width;
			if (!width) {
				return buildPackUrl({ prefix, name: providerValue });
			}
			// Iconify 的 SVG 自带宽高，插入时按需要的尺寸交给浏览器缩放即可
			return buildPackUrl({ prefix, name: providerValue });
		},
	};
}
