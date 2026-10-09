/**
 * 在线字体：清单和下载都由原生层代发。
 *
 * 为什么不直接在页面里 fetch 那个资源服务：接口要求 HMAC 签名（五个必填请求头），
 * 密钥只在 BuildConfig 里（local.properties 注入），进 Web 产物就等于把密钥公开；
 * 而且对象存储直链的域名不在 WebView 的放行范围内。所以页面只跟 `AshenBridge`
 * 说话，拿回来的站内 URL 与页面同源，直接 fetch 成 File 再走本地字体那套
 * （IndexedDB 记录 + OPFS 字节 + FontFace 注册），下载来的字体和手动导入的
 * 完全同一条路，离线也照样能用。
 */

export interface OnlineFont {
	slug: string;
	name: string;
	description: string;
	fileName: string;
	versionName: string;
	sizeBytes: number;
	/** 服务端给的字节指纹，页面导入前会再核一次 */
	sha256: string;
	/**
	 * 非空 = 这个资源要先激活对应功能才允许下载。服务端阶段二才会强校验
	 * （架构文档 §6.4），现阶段按文档要求由 App 端自己挡，我这里宁可不给入口
	 * 也不要让用户下下来才发现用不了。
	 */
	requireFeature: string | null;
}

type Bridge = {
	listFonts?: (callback: string) => void;
	downloadFont?: (slug: string, callback: string) => void;
};

function getBridge(): Bridge | null {
	const candidate = (window as unknown as { AshenBridge?: Bridge }).AshenBridge;
	if (!candidate || typeof candidate.listFonts !== "function"
		|| typeof candidate.downloadFont !== "function") {
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
	INVALID_SLUG: "字体标识不合法",
	NOT_FOUND: "这个字体已经下架了",
	RESOURCE_DISABLED: "这个字体已经下架了",
	VERSION_NOT_FOUND: "这个字体版本已经归档，换最新的那个下",
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

export async function listOnlineFonts(): Promise<OnlineFont[]> {
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
	const fonts: OnlineFont[] = [];

	for (const item of resources) {
		if (typeof item !== "object" || item === null) continue;
		const resource = item as Record<string, unknown>;
		const latest = resource.latest as Record<string, unknown> | undefined;
		if (!latest) continue;
		const slug = typeof resource.slug === "string" ? resource.slug : "";
		if (!slug) continue;
		fonts.push({
			slug,
			name: typeof resource.name === "string" ? resource.name : slug,
			description:
				typeof resource.description === "string" ? resource.description : "",
			fileName:
				typeof latest.file_name === "string" ? latest.file_name : `${slug}.ttf`,
			versionName:
				typeof latest.version_name === "string" ? latest.version_name : "",
			sizeBytes:
				typeof latest.file_size_bytes === "number"
					? latest.file_size_bytes
					: 0,
			sha256:
				typeof latest.file_sha256 === "string"
					? latest.file_sha256.toLowerCase()
					: "",
			requireFeature:
				typeof resource.require_feature === "string" &&
				resource.require_feature.length > 0
					? resource.require_feature
					: null,
		});
	}

	return fonts.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
}

export async function downloadOnlineFont({
	slug,
}: {
	slug: string;
}): Promise<File> {
	const bridge = getBridge();
	if (!bridge) throw new Error("No font service");

	const payload = await callNative({
		timeoutMessage: "Downloading this font took too long",
		emptyMessage: "The download came back empty",
		timeoutMs: 180_000,
		invoke: (callback) => bridge.downloadFont?.(slug, callback),
	});

	if (payload.success !== true) {
		throw new Error(serverError(payload));
	}

	// 原生层这条回的是扁平结构（success/url/name/size），和清单接口那种 data 包一层不同；
	// 两种都认，免得以后服务端字段一动就得跟着改两头
	const source = (payload.data as Record<string, unknown> | undefined) ?? payload;
	const url = typeof source.url === "string" ? source.url : "";
	if (!url.startsWith("/res-fonts/")) {
		throw new Error("The download result has no usable path");
	}

	const response = await fetch(url, { cache: "no-store" });
	if (!response.ok) {
		throw new Error("The downloaded file could not be read");
	}

	const bytes = await response.arrayBuffer();
	// 文件名只用服务端给的那一个：原生层落盘时加了时间戳前缀，
	// 而字体族名是从文件名推出来的，留着前缀会变成一串数字打头的名字
	const name =
		typeof source.name === "string" && source.name.length > 0
			? source.name
			: `${slug}.ttf`;

	return new File([bytes], name);
}
