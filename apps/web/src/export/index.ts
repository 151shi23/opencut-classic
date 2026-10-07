import type { FrameRate } from "opencut-wasm";
import { EXPORT_MIME_TYPES } from "./mime-types";

export const EXPORT_QUALITY_VALUES = [
	"low",
	"medium",
	"high",
	"very_high",
] as const;

export const EXPORT_FORMAT_VALUES = ["mp4", "webm"] as const;

export type ExportFormat = (typeof EXPORT_FORMAT_VALUES)[number];
export type ExportQuality = (typeof EXPORT_QUALITY_VALUES)[number];

export interface ExportOptions {
	format: ExportFormat;
	quality: ExportQuality;
	fps?: FrameRate;
	includeAudio?: boolean;
}

export interface ExportResult {
	success: boolean;
	buffer?: ArrayBuffer;
	error?: string;
	cancelled?: boolean;
}

export interface ExportState {
	isExporting: boolean;
	progress: number;
	result: ExportResult | null;
}

export function getExportMimeType({
	format,
}: {
	format: ExportFormat;
}): string {
	return EXPORT_MIME_TYPES[format];
}

export function getExportFileExtension({
	format,
}: {
	format: ExportFormat;
}): string {
	return `.${format}`;
}

export function downloadBuffer({
	buffer,
	filename,
	mimeType,
}: {
	buffer: ArrayBuffer;
	filename: string;
	mimeType: string;
}): void {
	// 安卓移植版：WebView 里 blob 锚点下载不触发 DownloadListener，导出的文件会凭空消失。
	// App 容器注入了 AshenBridge（videoBegin/videoChunk/videoEnd 三段式），走桥落相册；
	// 浏览器里打开（没有桥）仍走原来的锚点下载。
	const bridge = (window as unknown as {
		AshenBridge?: {
			videoBegin: (name: string) => void;
			videoChunk: (base64: string) => void;
			videoEnd: (ok: boolean, msg: string) => void;
		};
	}).AshenBridge;
	if (bridge && bridge.videoBegin && bridge.videoChunk && bridge.videoEnd) {
		try {
			const u8 = new Uint8Array(buffer);
			let s = "";
			const STEP = 0x8000; // 分段拼字符串，避开 apply 的栈上限
			for (let i = 0; i < u8.length; i += STEP) {
				const slice = u8.subarray(i, i + STEP);
				s += String.fromCharCode.apply(null, slice as unknown as number[]);
			}
			const b64 = btoa(s);
			const CHUNK = 3 * 1024 * 1024; // base64 再按 3MB 一片给桥，别塞爆
			bridge.videoBegin(filename);
			for (let i = 0; i < b64.length; i += CHUNK) {
				bridge.videoChunk(b64.slice(i, i + CHUNK));
			}
			bridge.videoEnd(true, "");
			return;
		} catch (err) {
			bridge.videoEnd(false, String(err));
			return;
		}
	}
	const blob = new Blob([buffer], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const downloadLink = document.createElement("a");
	downloadLink.href = url;
	downloadLink.download = filename;
	document.body.appendChild(downloadLink);
	downloadLink.click();
	document.body.removeChild(downloadLink);
	URL.revokeObjectURL(url);
}
