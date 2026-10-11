/**
 * 在线字体：清单和下载都由原生层代发。
 *
 * 为什么不直接在页面里 fetch 那个资源服务：接口要求 HMAC 签名（四个签名头 + 网关放行头），
 * 密钥只在 BuildConfig 里（local.properties 注入），进 Web 产物就等于把密钥公开；
 * 而且对象存储直链的域名不在 WebView 的放行范围内。所以页面只跟 `AshenBridge`
 * 说话，拿回来的站内 URL 与页面同源，直接 fetch 成 File 再走本地字体那套
 * （IndexedDB 记录 + OPFS 字节 + FontFace 注册），下载来的字体和手动导入的
 * 完全同一条路，离线也照样能用。
 *
 * 服务端 v3 起是**文件包模型**（一个 slug = 一个包，包内多个文件）：现在线上那个 `zt`
 * 包里就有 33 个字体、82MB。所以这里分三步 —— 列包 → 展开包内文件 → 按 `seq` 取单个文件，
 * 绝不做"点一下就整包拉下来"这种事。
 */

export interface OnlineFontPack {
	slug: string;
	name: string;
	description: string;
	category: string;
	/** 包内已发布文件数（服务端聚合值） */
	fileCount: number;
	totalSizeBytes: number;
	/** 包内容最近一次入库时间（服务器时区原样字符串） */
	updatedAt: string;
	/**
	 * 非空 = 这个包要先激活对应功能才允许下载。服务端阶段二才会强校验
	 * （架构文档 §6.4），现阶段按文档要求由 App 端自己挡，这里宁可不给入口
	 * 也不要让用户下下来才发现用不了。
	 */
	requireFeature: string | null;
}

export interface OnlineFontFile {
	/** 包内序号（1 起），取文件就靠它 */
	seq: number;
	fileName: string;
	sizeBytes: number;
	/** 服务端给的字节指纹，导入前会再核一次；也是"这个文件下过了"的判据 */
	sha256: string;
	versionName: string;
}

export interface DownloadedFontFile {
	file: File;
	/** 原生侧已有同校验值的字节，这次没重下 */
	skipped: boolean;
}

type Bridge = {
	listFonts?: (callback: string) => void;
	packFiles?: (slug: string, callback: string) => void;
	packFile?: (slug: string, seq: number, callback: string) => void;
};

function getBridge(): Bridge | null {
	const candidate = (window as unknown as { AshenBridge?: Bridge }).AshenBridge;
	if (
		!candidate
		|| typeof candidate.listFonts !== "function"
		|| typeof candidate.packFiles !== "function"
		|| typeof candidate.packFile !== "function"
	) {
		return null;
	}
	return candidate;
}

/** 桌面预览没有原生桥，选择器据此隐藏「在线字体」页签 */
export function isOnlineFontStoreAvailable(): boolean {
	return typeof window !== "undefined" && getBridge() !== null;
}

let callbackSeq = 0;

function callNative(
	{ invoke, timeoutMs, timeoutMessage, emptyMessage }: {
		invoke: (callback: string) => void;
		timeoutMs: number;
		timeoutMessage: string;
		emptyMessage: string;
	},
): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		const name = `__mwFontCb${++callbackSeq}`;
		const timer = window.setTimeout(() => {
			delete (window as unknown as Record<string, unknown>)[name];
			reject(new Error(timeoutMessage));
		}, timeoutMs);

		(window as unknown as Record<string, unknown>)[name] = (
			payload: unknown,
		) => {
			window.clearTimeout(timer);
			delete (window as unknown as Record<string, unknown>)[name];
			if (typeof payload !== "object" || payload === null) {
				reject(new Error(emptyMessage));
				return;
			}
			resolve(payload as Record<string, unknown>);
		};

		try {
			invoke(name);
		} catch (error) {
			window.clearTimeout(timer);
			delete (window as unknown as Record<string, unknown>)[name];
			reject(error instanceof Error ? error : new Error(String(error)));
		}
	});
}

/**
 * 服务端错误码 → 中文。文档 §6 那张表里的码不能直接甩给用户：
 * `TIMESTAMP_EXPIRED`（手机时钟偏差 >5 分钟）这类只有说清"改哪里"才有用。
 */
const ZH_BY_CODE: Record<string, string> = {
	MISSING_SIGNATURE: "请求头不完整，这台设备的签名配置有问题",
	INVALID_APP_ID: "应用标识不对，请联系开发者核对",
	TIMESTAMP_EXPIRED: "手机时间与标准时间差太多（超过 5 分钟），请先开启「自动设置时间」",
	INVALID_NONCE: "请求校验串异常，请重试一次",
	REPLAY_DETECTED: "这个请求已经用过了，请重新点一次",
	SIGNATURE_MISMATCH: "签名校验不通过，请联系开发者",
	APP_DISABLED: "这个应用版本已被停用",
	RATE_LIMITED: "请求太频繁，请等一会儿再试",
	INVALID_SLUG: "字体包标识不合法",
	NOT_FOUND: "这个字体包已经下架了",
	RESOURCE_DISABLED: "这个字体包已经下架了",
	EMPTY_RESOURCE: "这个字体包里还没有已发布的文件",
	VERSION_NOT_FOUND: "这个文件在包里已经下架，换列表里别的试试",
	SERVER_ERROR: "服务端出错了，稍后再试",
};

function serverError(payload: Record<string, unknown>): string {
	const code = typeof payload.code === "string" ? payload.code : "";
	const mapped = code ? ZH_BY_CODE[code] : undefined;
	if (mapped) return mapped;

	const error = payload.error ?? payload.message;
	return typeof error === "string" && error.trim().length > 0
		? error
		: "字体服务拒绝了这次请求";
}

function str(v: unknown, fallback = ""): string {
	return typeof v === "string" && v.length > 0 ? v : fallback;
}

function num(v: unknown): number {
	return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export async function listOnlineFontPacks(): Promise<OnlineFontPack[]> {
	const bridge = getBridge();
	if (!bridge) return [];

	const payload = await callNative({
		timeoutMessage: "Getting the font list took too long",
		emptyMessage: "The font list came back empty",
		timeoutMs: 30_000,
		invoke: (callback) => bridge.listFonts?.(callback),
	});

	if (payload.success !== true) {
		throw new Error(serverError(payload));
	}

	const data = payload.data as { resources?: unknown } | undefined;
	const resources = Array.isArray(data?.resources) ? data.resources : [];
	const packs: OnlineFontPack[] = [];

	for (const item of resources) {
		if (typeof item !== "object" || item === null) continue;
		const resource = item as Record<string, unknown>;
		const slug = str(resource.slug);
		if (!slug) continue;
		const feature = str(resource.require_feature);
		packs.push({
			slug,
			name: str(resource.name, slug),
			description: str(resource.description),
			category: str(resource.category, "font"),
			fileCount: num(resource.file_count),
			totalSizeBytes: num(resource.total_size_bytes),
			updatedAt: str(resource.files_updated_at),
			requireFeature: feature.length > 0 ? feature : null,
		});
	}

	return packs.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
}

export async function listOnlinePackFiles({
	slug,
}: {
	slug: string;
}): Promise<OnlineFontFile[]> {
	const bridge = getBridge();
	if (!bridge) throw new Error("No font service");

	const payload = await callNative({
		timeoutMessage: "Reading this font pack took too long",
		emptyMessage: "The font pack came back empty",
		timeoutMs: 30_000,
		invoke: (callback) => bridge.packFiles?.(slug, callback),
	});

	if (payload.success !== true) {
		throw new Error(serverError(payload));
	}

	const incoming = Array.isArray(payload.files) ? payload.files : [];
	const files: OnlineFontFile[] = [];
	for (const item of incoming) {
		if (typeof item !== "object" || item === null) continue;
		const file = item as Record<string, unknown>;
		const seq = num(file.seq);
		if (seq <= 0) continue;
		files.push({
			seq,
			fileName: str(file.file_name, `${slug}-${seq}.ttf`),
			sizeBytes: num(file.file_size_bytes),
			sha256: str(file.file_sha256).toLowerCase(),
			versionName: str(file.version_name, `v${seq}`),
		});
	}

	// 服务端按 seq 升序回，但列表要按字体名好找
	return files.sort((a, b) => a.fileName.localeCompare(b.fileName, "en"));
}

export async function downloadOnlinePackFile({
	slug,
	seq,
	sha256,
}: {
	slug: string;
	seq: number;
	sha256: string;
}): Promise<DownloadedFontFile> {
	const bridge = getBridge();
	if (!bridge) throw new Error("No font service");

	const payload = await callNative({
		timeoutMessage: "Downloading this font took too long",
		emptyMessage: "The download came back empty",
		timeoutMs: 180_000,
		invoke: (callback) => bridge.packFile?.(slug, seq, callback),
	});

	if (payload.success !== true) {
		throw new Error(serverError(payload));
	}

	// 原生层这条回的是扁平结构（success/url/name/size/sha256/skipped）
	const url = str(payload.url);
	if (!url.startsWith("/res-fonts/")) {
		throw new Error("The download result has no usable path");
	}

	const response = await fetch(url, { cache: "no-store" });
	if (!response.ok) {
		throw new Error("The downloaded file could not be read");
	}

	const bytes = await response.arrayBuffer();
	const expected = sha256.toLowerCase();
	if (expected.length > 0) {
		const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
		const hex = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
		// 原生侧已经核过一次（对象存储 → 私有目录），这一道核的是（私有目录 → 页面）
		if (hex !== expected) {
			throw new Error("The font file does not match its checksum");
		}
	}

	/*
	 * 文件名只用服务端给的那一个：落盘名带校验值前缀，而字体族名是从文件名推出来的，
	 * 留着前缀会变成一串十六进制打头的怪名字。
	 */
	const name = str(payload.name, `${slug}-${seq}.ttf`);

	return {
		file: new File([bytes], name),
		skipped: payload.skipped === true,
	};
}
