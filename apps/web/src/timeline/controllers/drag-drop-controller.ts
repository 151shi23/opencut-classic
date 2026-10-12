import type { DragEvent } from "react";
import { toast } from "sonner";
import { processMediaAssets } from "@/media/processing";
import { showMediaUploadToast } from "@/media/upload-toast";
import {
	DEFAULT_NEW_ELEMENT_DURATION,
	toElementDurationTicks,
} from "@/timeline/creation";
import { BASE_TIMELINE_PIXELS_PER_SECOND } from "@/timeline/scale";
import type { FrameRate } from "opencut-wasm";
import {
	buildTextElement,
	buildGraphicElement,
	buildStickerElement,
	buildElementFromMedia,
	buildEffectElement,
	isVisualElement,
} from "@/timeline/element-utils";
import { AddTrackCommand, InsertElementCommand } from "@/commands/timeline";
import { BatchCommand } from "@/commands";
import type { Command } from "@/commands/base-command";
import { computeDropTarget } from "@/timeline/components/drop-target";
import { effectsRegistry } from "@/effects/registry";
import type { TimelineDragSource } from "@/timeline/drag-source";
import type {
	TrackType,
	DropTarget,
	ElementType,
	SceneTracks,
	TimelineTrack,
	CreateTimelineElement,
} from "@/timeline";
import type { TimelineDragData } from "@/timeline/drag";
import type { MediaAsset } from "@/media/types";
import type { ProcessedMediaAsset } from "@/media/processing";
import { roundFrameTime, type MediaTime } from "@/wasm";

// --- Config ---

export interface DragDropConfig {
	zoomLevel: number;
	getContainerEl: () => HTMLDivElement | null;
	getHeaderEl: () => HTMLElement | null;
	getTracksScrollEl: () => HTMLDivElement | null;
	getActiveProjectFps: () => FrameRate | null;
	getActiveProjectId: () => string | null;
	getSceneTracks: () => SceneTracks;
	getCurrentPlayheadTime: () => MediaTime;
	getMediaAssets: () => MediaAsset[];
	dragSource: TimelineDragSource;
	addMediaAsset: (args: {
		projectId: string;
		asset: ProcessedMediaAsset;
	}) => Promise<MediaAsset | null>;
	executeCommand: (command: Command) => void;
	insertElement: (args: {
		placement: { mode: "explicit"; trackId: string };
		element: CreateTimelineElement;
	}) => void;
	addClipEffect: (args: {
		trackId: string;
		elementId: string;
		effectType: string;
	}) => void;
}

export interface DragDropConfigRef {
	readonly current: DragDropConfig;
}

// --- State ---

interface DragOverState {
	kind: "over";
	dropTarget: DropTarget | null;
	elementType: ElementType | null;
}

type DragDropState = { kind: "idle" } | DragOverState;

interface TimelineCoords {
	mouseX: number;
	mouseY: number;
}

// --- Pure helpers ---

function elementTypeFromDrag({
	dragData,
}: {
	dragData: TimelineDragData;
}): ElementType {
	switch (dragData.type) {
		case "text":
			return "text";
		case "graphic":
			return "graphic";
		case "sticker":
			return "sticker";
		case "effect":
			return "effect";
		case "media":
			return dragData.mediaType;
	}
}

function getTargetElementTypesForDrag({
	dragData,
}: {
	dragData: TimelineDragData;
}): string[] | undefined {
	if (dragData.type === "effect") return dragData.targetElementTypes;
	if (dragData.type === "media") return dragData.targetElementTypes;
	return undefined;
}

function getDurationForDrag({
	dragData,
	mediaAssets,
}: {
	dragData: TimelineDragData;
	mediaAssets: MediaAsset[];
}): MediaTime {
	if (dragData.type !== "media") return DEFAULT_NEW_ELEMENT_DURATION;
	const media = mediaAssets.find((asset) => asset.id === dragData.id);
	return toElementDurationTicks({ seconds: media?.duration });
}

function orderedTracks({
	sceneTracks,
}: {
	sceneTracks: SceneTracks;
}): TimelineTrack[] {
	return [...sceneTracks.overlay, sceneTracks.main, ...sceneTracks.audio];
}

// --- Controller ---

export class DragDropController {
	private state: DragDropState = { kind: "idle" };
	private enterCount = 0;
	/** 触屏长按拖动时 dragover 是逐帧来的，合并到每帧最多算一次目标位。 */
	private pendingOver: DragEvent | null = null;
	private overFrame: number | null = null;
	private lastOverKey = "";
	private readonly subscribers = new Set<() => void>();
	private readonly configRef: DragDropConfigRef;

	constructor(deps: { configRef: DragDropConfigRef }) {
		this.configRef = deps.configRef;
		this.onDragEnter = this.onDragEnter.bind(this);
		this.onDragOver = this.onDragOver.bind(this);
		this.onDragLeave = this.onDragLeave.bind(this);
		this.onDrop = this.onDrop.bind(this);
	}

	// 拖拽落到时间线之外时，浏览器会执行默认动作（WebView 会直接打开被拖的图片）。
	// 只要素材拖拽还在进行，就把它按住。
	private handleDocumentDragOver = (event: globalThis.DragEvent): void => {
		if (this.configRef.current.dragSource.isActive()) event.preventDefault();
	};

	private handleDocumentDrop = (event: globalThis.DragEvent): void => {
		if (this.configRef.current.dragSource.isActive()) event.preventDefault();
	};

	attachDocumentGuards(): () => void {
		document.addEventListener("dragover", this.handleDocumentDragOver);
		document.addEventListener("drop", this.handleDocumentDrop);
		return () => {
			document.removeEventListener("dragover", this.handleDocumentDragOver);
			document.removeEventListener("drop", this.handleDocumentDrop);
		};
	}

	private get config(): DragDropConfig {
		return this.configRef.current;
	}

	get isDragOver(): boolean {
		return this.state.kind !== "idle";
	}

	get dropTarget(): DropTarget | null {
		return this.state.kind === "over" ? this.state.dropTarget : null;
	}

	get dragElementType(): ElementType | null {
		return this.state.kind === "over" ? this.state.elementType : null;
	}

	subscribe(fn: () => void): () => void {
		this.subscribers.add(fn);
		return () => this.subscribers.delete(fn);
	}

	destroy(): void {
		if (this.overFrame !== null) {
			cancelAnimationFrame(this.overFrame);
			this.overFrame = null;
		}
		this.pendingOver = null;
		this.subscribers.clear();
	}

	// --- Drag event handlers (bound, stable, passed as React props) ---

	onDragEnter(event: DragEvent): void {
		event.preventDefault();
		const hasAsset = this.config.dragSource.isActive();
		const hasFiles = event.dataTransfer.types.includes("Files");
		if (!hasAsset && !hasFiles) return;

		this.enterCount += 1;
		if (this.state.kind === "idle") {
			this.setOver({ dropTarget: null, elementType: null });
		}
	}

	onDragOver(event: DragEvent): void {
		event.preventDefault();
		// dropEffect 必须在本帧的事件里就设好，不然指针显示成禁止符号。
		if (this.config.dragSource.isActive()) {
			event.dataTransfer.dropEffect = "copy";
		}
		this.pendingOver = event;
		if (this.overFrame !== null) return;
		this.overFrame = requestAnimationFrame(() => {
			this.overFrame = null;
			const pending = this.pendingOver;
			this.pendingOver = null;
			if (pending) this.applyDragOver(pending);
		});
	}

	private flushOver(): void {
		if (this.overFrame === null) return;
		cancelAnimationFrame(this.overFrame);
		this.overFrame = null;
		const pending = this.pendingOver;
		this.pendingOver = null;
		if (pending) this.applyDragOver(pending);
	}

	private applyDragOver(event: DragEvent): void {
		const coords = this.getMouseTimelineCoords({ event });
		if (!coords) return;

		const dragData = this.config.dragSource.getActive();
		const hasFiles = event.dataTransfer.types.includes("Files");
		const isExternal = hasFiles && !dragData;

		if (!dragData) {
			// 外部文件没有落点可算，只在刚进入时通知一次；否则逐帧 dragover 会一直触发整条时间线重渲染。
			if (hasFiles && isExternal && this.state.kind !== "over") {
				this.setOver({ dropTarget: null, elementType: null });
			}
			return;
		}

		const elementType = elementTypeFromDrag({ dragData });
		const duration = getDurationForDrag({
			dragData,
			mediaAssets: this.config.getMediaAssets(),
		});
		const targetElementTypes = getTargetElementTypesForDrag({ dragData });

		const sceneTracks = this.config.getSceneTracks();
		const target = computeDropTarget({
			elementType,
			mouseX: coords.mouseX,
			mouseY: coords.mouseY,
			tracks: sceneTracks,
			playheadTime: this.config.getCurrentPlayheadTime(),
			isExternalDrop: isExternal,
			elementDuration: duration,
			pixelsPerSecond: BASE_TIMELINE_PIXELS_PER_SECOND,
			zoomLevel: this.config.zoomLevel,
			targetElementTypes,
		});

		const fps = this.config.getActiveProjectFps();
		target.xPosition = fps
			? roundFrameTime({ time: target.xPosition, fps })
			: target.xPosition;

		// 手指停在同一个落点时 dragover 仍然一直触发，整条时间线没必要跟着重渲染。
		const key = [
			String(elementType),
			target.trackIndex,
			target.isNewTrack,
			String(target.insertPosition),
			String(target.xPosition),
			target.targetElement?.elementId ?? "",
		].join("|");
		if (key === this.lastOverKey && this.state.kind === "over") return;
		this.lastOverKey = key;
		this.setOver({ dropTarget: target, elementType });
	}

	onDragLeave(event: DragEvent): void {
		event.preventDefault();
		if (this.enterCount === 0) return;
		this.enterCount -= 1;
		if (this.enterCount === 0) {
			if (this.overFrame !== null) {
				cancelAnimationFrame(this.overFrame);
				this.overFrame = null;
				this.pendingOver = null;
			}
			this.setIdle();
		}
	}

	onDrop(event: DragEvent): void {
		event.preventDefault();
		this.enterCount = 0;
		// 落点状态是按帧算的，drop 可能赶在最后一帧之前，先把它结算掉。
		this.flushOver();

		const dragData = this.config.dragSource.getActive();
		const hasFiles = event.dataTransfer.files?.length > 0;
		if (!dragData && !hasFiles) return;

		const currentTarget = this.dropTarget;
		this.setIdle();

		try {
			if (dragData) {
				if (!currentTarget) return;
				this.executeAssetDrop({ target: currentTarget, dragData });
				return;
			}

			const coords = this.getMouseTimelineCoords({ event });
			if (!coords) return;
			this.executeFileDrop({
				files: Array.from(event.dataTransfer.files),
				mouseX: coords.mouseX,
				mouseY: coords.mouseY,
			}).catch((error) => {
				console.error("Failed to process file drop:", error);
			});
		} catch (error) {
			console.error("Failed to process drop:", error);
		}
	}

	// --- Private ---

	private setOver(state: {
		dropTarget: DropTarget | null;
		elementType: ElementType | null;
	}): void {
		this.state = { kind: "over", ...state };
		if (!state.dropTarget) {
			this.lastOverKey = "";
		}
		this.notify();
	}

	private setIdle(): void {
		this.state = { kind: "idle" };
		this.lastOverKey = "";
		this.notify();
	}

	private notify(): void {
		for (const fn of this.subscribers) fn();
	}

	private getMouseTimelineCoords({
		event,
	}: {
		event: DragEvent;
	}): TimelineCoords | null {
		const scrollContainer = this.config.getTracksScrollEl();
		const referenceRect =
			scrollContainer?.getBoundingClientRect() ??
			this.config.getContainerEl()?.getBoundingClientRect();
		if (!referenceRect) return null;

		const scrollLeft = scrollContainer?.scrollLeft ?? 0;
		const scrollTop = scrollContainer?.scrollTop ?? 0;
		const headerHeight =
			this.config.getHeaderEl()?.getBoundingClientRect().height ?? 0;

		return {
			mouseX: event.clientX - referenceRect.left + scrollLeft,
			mouseY: event.clientY - referenceRect.top + scrollTop - headerHeight,
		};
	}

	// Shared insertion logic — new track vs existing track.
	private insertAtTarget({
		element,
		target,
		trackType,
	}: {
		element: CreateTimelineElement;
		target: DropTarget;
		trackType: TrackType;
	}): void {
		if (target.isNewTrack) {
			const addTrackCmd = new AddTrackCommand({
				type: trackType,
				index: target.trackIndex,
			});
			this.config.executeCommand(
				new BatchCommand([
					addTrackCmd,
					new InsertElementCommand({
						element,
						placement: { mode: "explicit", trackId: addTrackCmd.getTrackId() },
					}),
				]),
			);
			return;
		}

		const tracks = orderedTracks({ sceneTracks: this.config.getSceneTracks() });
		const track = tracks[target.trackIndex];
		if (!track) return;
		this.config.insertElement({
			placement: { mode: "explicit", trackId: track.id },
			element,
		});
	}

	private executeAssetDrop({
		target,
		dragData,
	}: {
		target: DropTarget;
		dragData: TimelineDragData;
	}): void {
		switch (dragData.type) {
			case "text":
				this.executeTextDrop({ target, dragData });
				return;
			case "graphic":
				this.executeGraphicDrop({ target, dragData });
				return;
			case "sticker":
				this.executeStickerDrop({ target, dragData });
				return;
			case "effect":
				this.executeEffectDrop({ target, dragData });
				return;
			case "media":
				this.executeMediaDrop({ target, dragData });
				return;
		}
	}

	private executeTextDrop({
		target,
		dragData,
	}: {
		target: DropTarget;
		dragData: Extract<TimelineDragData, { type: "text" }>;
	}): void {
		const element = buildTextElement({
			raw: {
				name: dragData.name ?? "",
				params: {
					...(dragData.params ?? {}),
					content: dragData.content ?? "",
				},
			},
			startTime: target.xPosition,
		});
		this.insertAtTarget({ element, target, trackType: "text" });
	}

	private executeStickerDrop({
		target,
		dragData,
	}: {
		target: DropTarget;
		dragData: Extract<TimelineDragData, { type: "sticker" }>;
	}): void {
		const element = buildStickerElement({
			stickerId: dragData.stickerId,
			name: dragData.name,
			startTime: target.xPosition,
		});
		this.insertAtTarget({ element, target, trackType: "graphic" });
	}

	private executeGraphicDrop({
		target,
		dragData,
	}: {
		target: DropTarget;
		dragData: Extract<TimelineDragData, { type: "graphic" }>;
	}): void {
		const element = buildGraphicElement({
			definitionId: dragData.definitionId,
			name: dragData.name,
			startTime: target.xPosition,
			params: dragData.params,
		});
		this.insertAtTarget({ element, target, trackType: "graphic" });
	}

	private executeMediaDrop({
		target,
		dragData,
	}: {
		target: DropTarget;
		dragData: Extract<TimelineDragData, { type: "media" }>;
	}): void {
		if (target.targetElement) {
			// Replace media source — not yet implemented
			return;
		}

		const mediaAsset = this.config
			.getMediaAssets()
			.find((asset) => asset.id === dragData.id);
		if (!mediaAsset) return;

		const trackType: TrackType =
			dragData.mediaType === "audio" ? "audio" : "video";
		const element = buildElementFromMedia({
			mediaId: mediaAsset.id,
			mediaType: mediaAsset.type,
			name: mediaAsset.name,
			duration: toElementDurationTicks({ seconds: mediaAsset.duration }),
			startTime: target.xPosition,
		});
		this.insertAtTarget({ element, target, trackType });
	}

	private executeEffectDrop({
		target,
		dragData,
	}: {
		target: DropTarget;
		dragData: Extract<TimelineDragData, { type: "effect" }>;
	}): void {
		if (target.targetElement) {
			this.config.addClipEffect({
				trackId: target.targetElement.trackId,
				elementId: target.targetElement.elementId,
				effectType: dragData.effectType,
			});
			return;
		}

		// Canvas2D 通道（调色 / 滤镜 / 叠加）只在元素纹理上传前生效，整帧特效轨走的是
		// wasm 着色器。所以拖到空白处按剪映的滤镜习惯处理：应用到时间线上全部画面素材。
		if (
			effectsRegistry.has(dragData.effectType) &&
			effectsRegistry.get(dragData.effectType).renderer.canvas2d
		) {
			this.applyCanvas2dEffectToClips({
				effectType: dragData.effectType,
				name: dragData.name,
			});
			return;
		}

		const element = buildEffectElement({
			effectType: dragData.effectType,
			startTime: target.xPosition,
		});

		const existingEffectTrack = orderedTracks({
			sceneTracks: this.config.getSceneTracks(),
		}).find((track) => track.type === "effect");

		if (existingEffectTrack) {
			this.config.insertElement({
				placement: { mode: "explicit", trackId: existingEffectTrack.id },
				element,
			});
			return;
		}

		this.insertAtTarget({ element, target, trackType: "effect" });
	}

	/** 调色 / 滤镜类特效拖到空白处：给全部画面素材各挂一份，等价于剪映的「应用到全部」。 */
	private applyCanvas2dEffectToClips({
		effectType,
		name,
	}: {
		effectType: string;
		name: string;
	}): void {
		const tracks = orderedTracks({ sceneTracks: this.config.getSceneTracks() });
		let applied = 0;
		for (const track of tracks) {
			if (!("elements" in track)) continue;
			for (const element of track.elements) {
				if (!isVisualElement(element)) continue;
				if (element.effects?.some((effect) => effect.type === effectType))
					continue;
				this.config.addClipEffect({
					trackId: track.id,
					elementId: element.id,
					effectType,
				});
				applied += 1;
			}
		}

		if (applied === 0) {
			toast.error("时间线上还没有画面素材，先把视频或图片拖进来");
			return;
		}
		toast.success(`已把「${name}」应用到 ${applied} 个素材`);
	}

	private async executeFileDrop({
		files,
		mouseX,
		mouseY,
	}: {
		files: File[];
		mouseX: number;
		mouseY: number;
	}): Promise<void> {
		const projectId = this.config.getActiveProjectId();
		if (!projectId) return;

		await showMediaUploadToast({
			filesCount: files.length,
			promise: async () => {
				const processedAssets = await processMediaAssets({ files });

				// Sequential on purpose: each iteration reads getSceneTracks()
				// to decide placement (reuse empty main vs new track) and that
				// decision depends on the effects of prior inserts.
				for (const asset of processedAssets) {
					const createdAsset = await this.config.addMediaAsset({
						projectId,
						asset,
					});
					if (!createdAsset) continue;

					const duration = toElementDurationTicks({
						seconds: createdAsset.duration,
					});

					const sceneTracks = this.config.getSceneTracks();
					const currentTime = this.config.getCurrentPlayheadTime();

					const reuseMainTrackId =
						createdAsset.type !== "audio" &&
						sceneTracks.overlay.length === 0 &&
						sceneTracks.audio.length === 0 &&
						sceneTracks.main.elements.length === 0
							? sceneTracks.main.id
							: null;

					if (reuseMainTrackId) {
						this.config.insertElement({
							placement: { mode: "explicit", trackId: reuseMainTrackId },
							element: buildElementFromMedia({
								mediaId: createdAsset.id,
								mediaType: createdAsset.type,
								name: createdAsset.name,
								duration,
								startTime: currentTime,
							}),
						});
						continue;
					}

					const dropTarget = computeDropTarget({
						elementType: createdAsset.type,
						mouseX,
						mouseY,
						tracks: sceneTracks,
						playheadTime: currentTime,
						isExternalDrop: true,
						elementDuration: duration,
						pixelsPerSecond: BASE_TIMELINE_PIXELS_PER_SECOND,
						zoomLevel: this.config.zoomLevel,
					});

					const trackType: TrackType =
						createdAsset.type === "audio" ? "audio" : "video";
					this.insertAtTarget({
						element: buildElementFromMedia({
							mediaId: createdAsset.id,
							mediaType: createdAsset.type,
							name: createdAsset.name,
							duration,
							startTime: dropTarget.xPosition,
						}),
						target: dropTarget,
						trackType,
					});
				}

				return {
					uploadedCount: processedAssets.length,
					assetNames: processedAssets.map((asset) => asset.name),
				};
			},
		});
	}
}
