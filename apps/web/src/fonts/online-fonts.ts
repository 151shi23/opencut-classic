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

function serverError(payload: Record<string, unknown>): string {
	const error = payload.error ?? payload.message;
	return typeof error === "string" && error.trim().length > 0
		? error
		: "The font service refused the request";
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
