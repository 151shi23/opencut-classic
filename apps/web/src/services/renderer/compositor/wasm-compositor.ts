import {
	getCompositorCanvas,
	getLastFrameProfile,
	initCompositor,
	releaseTexture,
	renderFrame,
	resizeCompositor,
	uploadTexture,
} from "opencut-wasm";
import {
	incrementCounter,
	isRenderPerfEnabled,
	recordWasmFrameProfile,
} from "@/diagnostics/render-perf";
import type { ElementCanvas2d } from "@/effects/types";
import type {
	ExternalTextureDescriptor,
	FrameDescriptor,
	RenderedTextureDescriptor,
	TextureUploadDescriptor,
} from "./types";

/**
 * One slot in the derived-texture cache. The OffscreenCanvas is persistent —
 * we reuse and redraw into it across frames, which is the change that takes
 * the WebGL upload path off the per-frame critical path for static content.
 */
type RenderedCacheEntry = {
	kind: "rendered";
	canvas: OffscreenCanvas;
	contentHash: string;
	effectKey: string | null;
	width: number;
	height: number;
};

type ExternalCacheEntry = {
	kind: "external";
	source: CanvasImageSource;
	width: number;
	height: number;
	/**
	 * 带 Canvas2D 特效的元素不能直接把解码帧交给 wasm：必须先把滤镜/叠加画进
	 * 一块自己的画布。这块画布按纹理 id 长期复用，逐帧重画而不重新分配。
	 */
	effectCanvas: OffscreenCanvas | null;
	effectKey: string | null;
};

class WasmCompositor {
	private canvas: HTMLCanvasElement | null = null;
	private initializedSize: { width: number; height: number } | null = null;
	private cache = new Map<string, RenderedCacheEntry | ExternalCacheEntry>();

	ensureInitialized({ width, height }: { width: number; height: number }) {
		if (!this.canvas) {
			initCompositor(width, height);
			this.canvas = getCompositorCanvas();
			this.initializedSize = { width, height };
			return;
		}

		if (
			!this.initializedSize ||
			this.initializedSize.width !== width ||
			this.initializedSize.height !== height
		) {
			resizeCompositor(width, height);
			this.initializedSize = { width, height };
		}
	}

	getCanvas(): HTMLCanvasElement {
		if (!this.canvas) {
			throw new Error("Compositor is not initialized");
		}
		return this.canvas;
	}

	syncTextures(textures: TextureUploadDescriptor[]) {
		const nextIds = new Set(textures.map((texture) => texture.id));
		for (const previousId of this.cache.keys()) {
			if (!nextIds.has(previousId)) {
				releaseTexture(previousId);
				this.cache.delete(previousId);
			}
		}

		for (const texture of textures) {
			if (texture.kind === "external") {
				this.syncExternalTexture(texture);
			} else {
				this.syncRenderedTexture(texture);
			}
		}
	}

	render(frame: FrameDescriptor) {
		renderFrame(frame);
		if (isRenderPerfEnabled()) {
			recordWasmFrameProfile(
				getLastFrameProfile() as Array<{ name: string; durationMs: number }>,
			);
		}
	}

	private syncExternalTexture(texture: ExternalTextureDescriptor) {
		const previous = this.cache.get(texture.id);
		const effectKey = texture.canvas2d?.key ?? null;
		if (
			previous?.kind === "external" &&
			previous.source === texture.source &&
			previous.width === texture.width &&
			previous.height === texture.height &&
			previous.effectKey === effectKey
		) {
			incrementCounter({ name: "textureCacheHit" });
			return;
		}

		let source = texture.source;
		let effectCanvas: OffscreenCanvas | null = null;
		if (texture.canvas2d) {
			effectCanvas =
				previous?.kind === "external" &&
				previous.effectCanvas &&
				previous.effectCanvas.width === texture.width &&
				previous.effectCanvas.height === texture.height
					? previous.effectCanvas
					: new OffscreenCanvas(texture.width, texture.height);
			const ctx = effectCanvas.getContext("2d");
			if (!ctx) {
				throw new Error(
					`Failed to get 2d context for effect texture ${texture.id}`,
				);
			}
			ctx.clearRect(0, 0, texture.width, texture.height);
			paintWithCanvas2d({
				ctx,
				width: texture.width,
				height: texture.height,
				canvas2d: texture.canvas2d,
				draw: (target) => {
					target.drawImage(
						texture.source,
						0,
						0,
						texture.width,
						texture.height,
					);
				},
			});
			source = effectCanvas;
		} else {
			source = ensureOffscreenCanvas({
				source: texture.source,
				width: texture.width,
				height: texture.height,
				label: `texture upload ${texture.id}`,
			});
		}

		incrementCounter({ name: "textureUpload" });
		incrementCounter({
			name: "textureUploadPixels",
			by: texture.width * texture.height,
		});
		uploadTexture({
			id: texture.id,
			source,
			width: texture.width,
			height: texture.height,
		});
		this.cache.set(texture.id, {
			kind: "external",
			source: texture.source,
			width: texture.width,
			height: texture.height,
			effectCanvas,
			effectKey,
		});
	}

	private syncRenderedTexture(texture: RenderedTextureDescriptor) {
		const previous = this.cache.get(texture.id);
		const effectKey = texture.canvas2d?.key ?? null;
		if (
			previous?.kind === "rendered" &&
			previous.contentHash === texture.contentHash &&
			previous.effectKey === effectKey &&
			previous.width === texture.width &&
			previous.height === texture.height
		) {
			incrementCounter({ name: "textureCacheHit" });
			return;
		}

		const canvas =
			previous?.kind === "rendered" &&
			previous.width === texture.width &&
			previous.height === texture.height
				? previous.canvas
				: createBackingCanvas({
						width: texture.width,
						height: texture.height,
					});

		const ctx = canvas.getContext("2d");
		if (!ctx) {
			throw new Error(`Failed to get 2d context for texture ${texture.id}`);
		}
		ctx.clearRect(0, 0, texture.width, texture.height);
		paintWithCanvas2d({
			ctx,
			width: texture.width,
			height: texture.height,
			canvas2d: texture.canvas2d ?? null,
			draw: texture.draw,
		});

		incrementCounter({ name: "textureUpload" });
		incrementCounter({
			name: "textureUploadPixels",
			by: texture.width * texture.height,
		});
		uploadTexture({
			id: texture.id,
			source: canvas,
			width: texture.width,
			height: texture.height,
		});
		this.cache.set(texture.id, {
			kind: "rendered",
			canvas,
			contentHash: texture.contentHash,
			effectKey,
			width: texture.width,
			height: texture.height,
		});
	}
}

export const wasmCompositor = new WasmCompositor();

function createBackingCanvas({
	width,
	height,
}: {
	width: number;
	height: number;
}): OffscreenCanvas {
	if (typeof OffscreenCanvas === "undefined") {
		throw new Error("OffscreenCanvas is not supported in this environment");
	}
	return new OffscreenCanvas(width, height);
}

/**
 * Canvas2D 通道：先按 filter 画内容，再把叠加画在上面。叠加必须在 filter 复位之后，
 * 否则「亮度」这类调色会把暗角、噪点一起改掉。
 */
function paintWithCanvas2d({
	ctx,
	width,
	height,
	canvas2d,
	draw,
}: {
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	width: number;
	height: number;
	canvas2d: ElementCanvas2d | null;
	draw: (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => void;
}) {
	if (!canvas2d) {
		draw(ctx);
		return;
	}
	ctx.save();
	if (canvas2d.filter) {
		ctx.filter = canvas2d.filter;
	}
	draw(ctx);
	ctx.restore();
	canvas2d.paint?.({ ctx, width, height });
}

function ensureOffscreenCanvas({
	source,
	width,
	height,
	label,
}: {
	source: CanvasImageSource;
	width: number;
	height: number;
	label: string;
}): OffscreenCanvas {
	if (source instanceof OffscreenCanvas) {
		return source;
	}

	if (typeof OffscreenCanvas === "undefined") {
		throw new Error(`OffscreenCanvas is required for ${label}`);
	}

	const canvas = new OffscreenCanvas(width, height);
	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error(`Failed to get 2d context for ${label}`);
	}
	context.clearRect(0, 0, width, height);
	context.drawImage(source, 0, 0, width, height);
	return canvas;
}
