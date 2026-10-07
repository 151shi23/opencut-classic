import type {
	MouseEvent as ReactMouseEvent,
	TouchEvent as ReactTouchEvent,
} from "react";
import type { FrameRate } from "opencut-wasm";
import {
	mediaTime,
	snapSeekMediaTime,
	TICKS_PER_SECOND,
	type MediaTime,
} from "@/wasm";
import {
	buildTimelineSnapPoints,
	getTimelineSnapThresholdInTicks,
	resolveTimelineSnap,
} from "@/timeline/snapping";
import { getBookmarkSnapPoints } from "@/timeline/bookmarks/index";
import { getElementEdgeSnapPoints } from "@/timeline/element-snap-source";
import { getAnimationKeyframeSnapPointsForTimeline } from "@/timeline/animation-snap-points";
import {
	getCenteredLineLeft,
	timelineTimeToPixels,
	timelineTimeToSnappedPixels,
} from "@/timeline";
import { BASE_TIMELINE_PIXELS_PER_SECOND } from "@/timeline/scale";
import type { Bookmark, SceneTracks } from "@/timeline";

// --- Session ---

interface ScrubSession {
	kind: "scrubbing";
	/** True when scrub started from a ruler click (not the playhead handle). */
	didStartFromRuler: boolean;
	/** True once the mouse has moved during a ruler drag. */
	hasMoved: boolean;
	/** Most recent frame-snapped time set by scrub(). */
	currentTime: MediaTime | null;
}

type Session = { kind: "idle" } | ScrubSession;

/**
 * mouse 与 touch 都只贡献一个横向坐标，统一成这一种入参，触屏才能直接复用
 * 桌面那套 scrub 逻辑（手指拖动时 Chrome 不再补发 mousemove，只能自己接 touch）。
 */
type PointerClientX = { clientX: number };

// --- Config ---

export interface PlayheadConfig {
	zoomLevel: number;
	duration: MediaTime;
	getActiveProjectFps: () => FrameRate | null;
	isShiftHeld: () => boolean;
	getIsPlaying: () => boolean;
	getRulerEl: () => HTMLDivElement | null;
	getRulerScrollEl: () => HTMLDivElement | null;
	getTracksScrollEl: () => HTMLDivElement | null;
	getPlayheadEl: () => HTMLDivElement | null;
	getSceneTracks: () => SceneTracks;
	getSceneBookmarks: () => Bookmark[];
	seek: (time: MediaTime) => void;
	setScrubbing: (isScrubbing: boolean) => void;
	setTimelineViewState: (viewState: {
		zoomLevel: number;
		scrollLeft: number;
		playheadTime: MediaTime;
	}) => void;
}

export interface PlayheadConfigRef {
	readonly current: PlayheadConfig;
}

// --- Pure helpers (px → logical) ---

function pixelToTime({
	clientX,
	rulerEl,
	zoomLevel,
	duration,
}: {
	clientX: number;
	rulerEl: HTMLDivElement;
	zoomLevel: number;
	duration: MediaTime;
}): MediaTime {
	const rulerRect = rulerEl.getBoundingClientRect();
	const contentWidth = timelineTimeToPixels({ time: duration, zoomLevel });
	const clampedX = Math.max(
		0,
		Math.min(contentWidth, clientX - rulerRect.left),
	);
	const seconds = Math.max(
		0,
		Math.min(
			duration / TICKS_PER_SECOND,
			clampedX / (BASE_TIMELINE_PIXELS_PER_SECOND * zoomLevel),
		),
	);
	return mediaTime({ ticks: Math.round(seconds * TICKS_PER_SECOND) });
}

// --- Controller ---

export class PlayheadController {
	private lastMouseClientX = 0;

	private session: Session = { kind: "idle" };
	private readonly configRef: PlayheadConfigRef;

	constructor(deps: { configRef: PlayheadConfigRef }) {
		this.configRef = deps.configRef;
		this.onPlayheadMouseDown = this.onPlayheadMouseDown.bind(this);
		this.onRulerMouseDown = this.onRulerMouseDown.bind(this);
		this.handleMouseMove = this.handleMouseMove.bind(this);
		this.handleMouseUp = this.handleMouseUp.bind(this);
		this.handleTouchMove = this.handleTouchMove.bind(this);
		this.handleTouchEnd = this.handleTouchEnd.bind(this);
	}

	private get config(): PlayheadConfig {
		return this.configRef.current;
	}

	get isActive(): boolean {
		return this.session.kind !== "idle";
	}

	getLastMouseClientX(): number {
		return this.lastMouseClientX;
	}

	destroy(): void {
		this.deactivate();
	}

	// --- Public event handlers (bound, stable references) ---

	onPlayheadMouseDown(event: ReactMouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
		this.beginScrub({
			clientX: event.clientX,
			didStartFromRuler: false,
			isElementSnappingEnabled: true,
		});
	}

	onRulerMouseDown(event: ReactMouseEvent): void {
		if (event.button !== 0) return;
		if (this.config.getPlayheadEl()?.contains(event.target as Node)) return;

		event.preventDefault();
		this.beginScrub({
			clientX: event.clientX,
			didStartFromRuler: true,
			// No element-edge snapping on initial ruler click — avoids a jarring jump.
			isElementSnappingEnabled: false,
		});
	}

	/**
	 * 触屏上 Chrome 只在抬指那一刻才补发 mousedown，靠 mouse 起手永远跟不上手指，
	 * 所以 touchstart 直接开会话，后续由 touchmove 连续喂坐标。
	 */
	onPlayheadTouchStart(event: ReactTouchEvent): void {
		const touch = event.touches[0];
		if (!touch) return;
		event.preventDefault();
		event.stopPropagation();
		this.beginScrub({
			clientX: touch.clientX,
			didStartFromRuler: false,
			isElementSnappingEnabled: true,
		});
	}

	onRulerTouchStart(event: ReactTouchEvent): void {
		const touch = event.touches[0];
		if (!touch) return;
		if (this.config.getPlayheadEl()?.contains(event.target as Node)) return;
		event.preventDefault();
		this.beginScrub({
			clientX: touch.clientX,
			didStartFromRuler: true,
			isElementSnappingEnabled: false,
		});
	}

	// --- Public non-session methods ---

	/**
	 * Imperatively updates the playhead DOM element's `left` style.
	 * Called on scroll and playback events to avoid React re-renders
	 * during animation frame updates.
	 */
	updatePlayheadLeft(time: MediaTime): void {
		const playheadEl = this.config.getPlayheadEl();
		if (!playheadEl) return;

		const centerPixel = timelineTimeToSnappedPixels({
			time,
			zoomLevel: this.config.zoomLevel,
		});
		const scrollLeft = this.config.getRulerScrollEl()?.scrollLeft ?? 0;
		playheadEl.style.left = `${getCenteredLineLeft({ centerPixel }) - scrollLeft}px`;
	}

	/**
	 * Updates the playhead position and auto-scrolls to keep the playhead
	 * visible during playback.
	 */
	handlePlaybackUpdate(time: MediaTime): void {
		this.updatePlayheadLeft(time);

		// Auto-scroll only during playback, not while scrubbing.
		if (!this.config.getIsPlaying() || this.session.kind === "scrubbing")
			return;

		const rulerViewport = this.config.getRulerScrollEl();
		const tracksViewport = this.config.getTracksScrollEl();
		if (!rulerViewport || !tracksViewport) return;

		const playheadPixels = timelineTimeToPixels({
			time,
			zoomLevel: this.config.zoomLevel,
		});
		const viewportWidth = rulerViewport.clientWidth;
		const isOutOfView =
			playheadPixels < rulerViewport.scrollLeft ||
			playheadPixels > rulerViewport.scrollLeft + viewportWidth;

		if (isOutOfView) {
			const desiredScroll = Math.max(
				0,
				Math.min(
					rulerViewport.scrollWidth - viewportWidth,
					playheadPixels - viewportWidth / 2,
				),
			);
			rulerViewport.scrollLeft = tracksViewport.scrollLeft = desiredScroll;
		}
	}

	// --- Private ---

	private beginScrub({
		clientX,
		didStartFromRuler,
		isElementSnappingEnabled,
	}: {
		clientX: number;
		didStartFromRuler: boolean;
		isElementSnappingEnabled: boolean;
	}): void {
		this.session = {
			kind: "scrubbing",
			didStartFromRuler,
			hasMoved: false,
			currentTime: null,
		};
		this.config.setScrubbing(true);
		this.scrub({ event: { clientX }, isElementSnappingEnabled });
		this.activate();
	}

	private activate(): void {
		window.addEventListener("mousemove", this.handleMouseMove);
		window.addEventListener("mouseup", this.handleMouseUp);
		// 手指拖动不会有 mousemove/mouseup，直接挂 touch 才跟得上手。
		window.addEventListener("touchmove", this.handleTouchMove, {
			passive: false,
		});
		window.addEventListener("touchend", this.handleTouchEnd);
		window.addEventListener("touchcancel", this.handleTouchEnd);
	}

	private deactivate(): void {
		window.removeEventListener("mousemove", this.handleMouseMove);
		window.removeEventListener("mouseup", this.handleMouseUp);
		window.removeEventListener("touchmove", this.handleTouchMove);
		window.removeEventListener("touchend", this.handleTouchEnd);
		window.removeEventListener("touchcancel", this.handleTouchEnd);
	}

	/**
	 * Converts pointer position to a frame-snapped timeline time and seeks.
	 * `isElementSnappingEnabled` controls element-edge snapping; frame-level snapping
	 * is always applied.
	 */
	private scrub({
		event,
		isElementSnappingEnabled,
	}: {
		event: PointerClientX;
		isElementSnappingEnabled: boolean;
	}): void {
		const ruler = this.config.getRulerEl();
		if (!ruler) return;

		const fps = this.config.getActiveProjectFps();
		if (!fps) return;

		const { zoomLevel, duration } = this.config;
		const rawTime = pixelToTime({
			clientX: event.clientX,
			rulerEl: ruler,
			zoomLevel,
			duration,
		});
		const frameTime = snapSeekMediaTime({ time: rawTime, duration, fps });

		const time = (() => {
			if (!isElementSnappingEnabled || this.config.isShiftHeld())
				return frameTime;

			const snapPoints = buildTimelineSnapPoints({
				sources: [
					() =>
						getElementEdgeSnapPoints({ tracks: this.config.getSceneTracks() }),
					() =>
						getBookmarkSnapPoints({
							bookmarks: this.config.getSceneBookmarks(),
						}),
					() =>
						getAnimationKeyframeSnapPointsForTimeline({
							tracks: this.config.getSceneTracks(),
						}),
				],
			});
			const result = resolveTimelineSnap({
				targetTime: frameTime,
				snapPoints,
				maxSnapDistance: getTimelineSnapThresholdInTicks({ zoomLevel }),
			});
			return result.snapPoint ? result.snappedTime : frameTime;
		})();

		if (this.session.kind === "scrubbing") {
			this.session.currentTime = time;
		}
		this.config.seek(time);
		this.lastMouseClientX = event.clientX;
	}

	private handleMouseMove(event: PointerClientX): void {
		if (this.session.kind !== "scrubbing") return;
		this.scrub({ event, isElementSnappingEnabled: true });
		if (this.session.didStartFromRuler) {
			this.session.hasMoved = true;
		}
	}

	private handleTouchMove(event: TouchEvent): void {
		if (this.session.kind !== "scrubbing") return;
		const touch = event.touches[0];
		if (!touch) return;
		// 手势不拦下来就会被判成滚动，落点会一直停在按下那一刻。
		event.preventDefault();
		this.handleMouseMove({ clientX: touch.clientX });
	}

	private handleMouseUp(event: PointerClientX): void {
		if (this.session.kind !== "scrubbing") return;

		const session = this.session;
		this.config.setScrubbing(false);

		if (session.currentTime !== null) {
			this.config.seek(session.currentTime);
			this.config.setTimelineViewState({
				zoomLevel: this.config.zoomLevel,
				scrollLeft: this.config.getTracksScrollEl()?.scrollLeft ?? 0,
				playheadTime: session.currentTime,
			});
		}

		// Ruler click without drag: snap to clicked position on mouseup.
		if (session.didStartFromRuler && !session.hasMoved) {
			this.scrub({ event, isElementSnappingEnabled: false });
		}

		this.session = { kind: "idle" };
		this.deactivate();
	}

	private handleTouchEnd(event: TouchEvent): void {
		const touch = event.changedTouches[0];
		this.handleMouseUp({ clientX: touch?.clientX ?? this.lastMouseClientX });
	}
}
