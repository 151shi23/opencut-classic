import type { SoundEffect } from "@/sounds/types";

// 必须是静态属性访问：Next 只把 process.env.NEXT_PUBLIC_XXX 这种写死的引用替换进客户端
// bundle，走 webEnv 那种整对象 parse 在浏览器里取不到值。
const FREESOUND_API_KEY = process.env.NEXT_PUBLIC_FREESOUND_API_KEY;

const SEARCH_ENDPOINT = "https://freesound.org/apiv2/search/text/";

// freesound 默认只回 id,name,tags,username,license —— previews 必须点名才给
const RESPONSE_FIELDS = [
	"id",
	"name",
	"description",
	"url",
	"previews",
	"duration",
	"type",
	"channels",
	"filesize",
	"bitrate",
	"bitdepth",
	"samplerate",
	"username",
	"tags",
	"license",
	"created",
	"num_downloads",
	"avg_rating",
	"num_ratings",
].join(",");

// 没有 commercial_only 这个参数，只能按许可证名过滤；非商业的 CC-BY-NC 排除掉
const COMMERCIAL_LICENSE_FILTER =
	'license:("Attribution" OR "Creative Commons 0")';

export const PAGE_SIZE = 30;

export interface FreesoundSort {
	value: string;
	label: string;
	needsQuery: boolean;
}

export const FREESOUND_SORTS: FreesoundSort[] = [
	{ value: "downloads_desc", label: "Most downloaded", needsQuery: false },
	{ value: "created_desc", label: "Newest", needsQuery: false },
	{ value: "rating_desc", label: "Top rated", needsQuery: false },
	{ value: "duration_asc", label: "Shortest", needsQuery: false },
	{ value: "score", label: "Relevance", needsQuery: true },
];

export function isFreesoundConfigured(): boolean {
	return Boolean(FREESOUND_API_KEY);
}

export class FreesoundError extends Error {}

function describeStatus({
	status,
	message,
}: {
	status: number;
	message: string;
}): string {
	if (status === 401 || status === 403) {
		return "Freesound rejected this API key";
	}
	if (status === 429) {
		return "Freesound rate limit reached, wait a minute";
	}
	return message || `Freesound request failed (${status})`;
}

interface Preview {
	key: string;
	url: string;
}

// 兼容三种可能的形状：{ "preview-hq-mp3": "https…" } / [ { key, url } ] / [ { urls: { mp3 } } ]
function collectPreviews({ source }: { source: unknown }): Preview[] {
	const previews: Preview[] = [];

	const push = ({ key, url }: { key: string; url: unknown }) => {
		if (typeof url === "string" && url.startsWith("http")) {
			previews.push({ key, url });
		}
	};

	const visit = ({ value, key }: { value: unknown; key: string }) => {
		if (typeof value === "string") {
			push({ key, url: value });
			return;
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				visit({ value: item, key });
			}
			return;
		}
		if (value && typeof value === "object") {
			const record = value as Record<string, unknown>;
			if ("url" in record) {
				push({ key: String(record.key ?? key), url: record.url });
				return;
			}
			for (const [name, child] of Object.entries(record)) {
				visit({ value: child, key: key ? `${key}-${name}` : name });
			}
		}
	};

	visit({ value: source, key: "" });
	return previews;
}

function previewScore({ key }: { key: string }): number {
	const normalized = key.toLowerCase();
	let score = 0;
	if (normalized.includes("mp3")) score += 4;
	else if (normalized.includes("ogg")) score += 1;
	if (normalized.includes("hq")) score += 2;
	if (normalized.includes("lq")) score -= 1;
	return score;
}

function pickPreviewUrl({
	previews,
}: {
	previews: Preview[];
}): string | undefined {
	let best: Preview | undefined;
	for (const preview of previews) {
		if (
			!best ||
			previewScore({ key: preview.key }) > previewScore({ key: best.key })
		) {
			best = preview;
		}
	}
	return best?.url;
}

export function previewExtension({ url }: { url: string }): string {
	const path = url.split("?")[0] ?? url;
	const tail = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	return /^[a-z0-9]{1,4}$/.test(tail) ? tail : "mp3";
}

function readString({ value }: { value: unknown }): string {
	return typeof value === "string" ? value : "";
}

function readNumber({ value }: { value: unknown }): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

// freesound 把 license 返回成 creativecommons 的 URL，直接显示一串链接没法看
const LICENSE_LABELS: Array<[RegExp, string]> = [
	[/publicdomain\/zero|creative\s*commons\s*0/i, "CC0"],
	[/noncommercial/i, "CC-BY-NC"],
	[/attribution|licenses\/by/i, "CC-BY"],
];

function licenseLabel({ value }: { value: string }): string {
	if (!value) return "";
	const match = LICENSE_LABELS.find(([pattern]) => pattern.test(value));
	if (match) return match[1];
	// 不是 URL 说明已经是人类可读名称，原样显示
	return value.startsWith("http") ? "" : value;
}

export function mapFreesoundSound({
	sound,
}: {
	sound: Record<string, unknown>;
}): SoundEffect {
	const previews = collectPreviews({ source: sound["previews"] });

	return {
		id: readNumber({ value: sound["id"] }),
		name: readString({ value: sound["name"] }) || "Untitled sound",
		description: readString({ value: sound["description"] }),
		url: readString({ value: sound["url"] }),
		previewUrl: pickPreviewUrl({ previews }),
		downloadUrl: readString({ value: sound["download"] }) || undefined,
		duration: readNumber({ value: sound["duration"] }),
		filesize: readNumber({ value: sound["filesize"] }),
		type: readString({ value: sound["type"] }),
		channels: readNumber({ value: sound["channels"] }),
		bitrate: readNumber({ value: sound["bitrate"] }),
		bitdepth: readNumber({ value: sound["bitdepth"] }),
		samplerate: readNumber({ value: sound["samplerate"] }),
		username: readString({ value: sound["username"] }) || "unknown",
		tags: Array.isArray(sound["tags"])
			? (sound["tags"] as unknown[]).map((tag) => String(tag))
			: [],
		license: licenseLabel({ value: readString({ value: sound["license"] }) }),
		created: readString({ value: sound["created"] }),
		downloads: readNumber({ value: sound["num_downloads"] }),
		rating: readNumber({ value: sound["avg_rating"] }),
		ratingCount: readNumber({ value: sound["num_ratings"] }),
	};
}

export interface FreesoundSearchResult {
	results: SoundEffect[];
	count: number;
	hasNext: boolean;
}

export async function searchFreesoundSounds({
	query,
	sort,
	page = 1,
	pageSize = PAGE_SIZE,
	commercialOnly,
}: {
	query: string;
	sort: string;
	page?: number;
	pageSize?: number;
	commercialOnly: boolean;
}): Promise<FreesoundSearchResult> {
	const apiKey = FREESOUND_API_KEY;
	if (!apiKey) {
		throw new FreesoundError("Freesound API key is not configured");
	}

	const trimmed = query.trim();
	const params = new URLSearchParams({
		fields: RESPONSE_FIELDS,
		page: String(page),
		page_size: String(pageSize),
	});

	if (trimmed) {
		params.set("query", trimmed);
	}

	const filters: string[] = [];
	if (commercialOnly) {
		filters.push(COMMERCIAL_LICENSE_FILTER);
	}
	if (filters.length > 0) {
		params.set("filter", filters.join(" "));
	}

	// 没有搜索词时 score 排序无意义，freesound 会直接报错
	const canUseScore = trimmed.length > 0 || sort !== "score";
	params.set("sort", canUseScore ? sort : "downloads_desc");

	const response = await fetch(`${SEARCH_ENDPOINT}?${params.toString()}`, {
		headers: { authorization: `Token ${apiKey}` },
	});

	const text = await response.text();
	if (!response.ok) {
		let message = "";
		try {
			const payload = JSON.parse(text) as { detail?: string; message?: string };
			message = payload.detail ?? payload.message ?? "";
		} catch {
			message = "";
		}
		throw new FreesoundError(
			describeStatus({ status: response.status, message }),
		);
	}

	const payload = JSON.parse(text) as {
		count?: number;
		next?: string | null;
		results?: unknown[];
	};
	const rawResults = Array.isArray(payload.results) ? payload.results : [];

	return {
		results: rawResults
			.map((sound) =>
				mapFreesoundSound({ sound: (sound ?? {}) as Record<string, unknown> }),
			)
			.filter((sound) => sound.previewUrl && sound.duration > 0),
		count: readNumber({ value: payload.count }),
		hasNext: Boolean(payload.next),
	};
}
