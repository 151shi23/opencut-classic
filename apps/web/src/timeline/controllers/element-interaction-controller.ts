import type {
	MouseEvent as ReactMouseEvent,
	TouchEvent as ReactTouchEvent,
} from "react";
import {
	buildMoveGroup,
	resolveGroupMove,
	snapGroupEdges,
	type GroupMoveResult,
	type MoveGroup,
} from "@/timeline/group-move";
import { BASE_TIMELINE_PIXELS_PER_SECOND } from "@/timeline/scale";
import {
	maxMediaTime,
	type MediaTime,
	mediaTime,
	roundFrameTime,
	subMediaTime,
	TICKS_PER_SECOND,
	ZERO_MEDIA_TIME,
} from "@/wasm";
import { TIMELINE_DRAG_THRESHOLD_PX } from "@/timeline/components/interaction";
import type { FrameRate } from "opencut-wasm";
import { isAndroidUI } from "@/android/detect";
import { computeDropTarget } from "@/timeline/components/drop-target";
import { getMouseTimeFromClientX } from "@/timeline/drag-utils";
import { generateUUID } from "@/utils/id";
import type { SnapPoint } from "@/timeline/snapping";
import type {
	DropTarget,
	ElementRef,
	ElementDragView,
	SceneTracks,
	TimelineElement,
	TimelineTrack,
} from "@/timeline";

const MOUSE_BUTTON_RIGHT = 2;

// --- Config ---

export interface ViewportAdapter {
	getZoomLevel: () => number;
	getTracksScrollEl: () => HTMLDivElement | null;
	getTracksContainerEl: () => HTMLDivElement | null;
	getHeaderEl: () => HTMLElement | null;
}

export interface InputAdapter {
	isShiftHeld: () => boolean;
}

export interface SceneReader {
	getTracks: () => SceneTracks;
	getActiveFps: () => FrameRate | null;
}

export interface ElementSelectionApi {
	getSelected: () => readonly ElementRef[];
	isSelected: (ref: ElementRef) => boolean;
	select: (ref: ElementRef) => void;
	handleClick: (args: ElementRef & { isMultiKey: boolean }) => void;
	clearKeyframeSelection: () => void;
}

export interface PlaybackReader {
	getCurrentTime: () => MediaTime;
}

export interface TimelineOps {
	moveElements: (args: Pick<GroupMoveResult, "moves" | "createTracks">) => void;
}

export interface SnapConfig {
	isEnabled: () => boolean;
	onChange?: (snapPoint: SnapPoint | null) => void;
}

export interface ElementInteractionDeps {
	viewport: ViewportAdapter;
	input: InputAdapter;
	scene: SceneReader;
	selection: ElementSelectionApi;
	playback: PlaybackReader;
	timeline: TimelineOps;
	snap: SnapConfig;
}

export interface ElementInteractionDepsRef {
	readonly current: ElementInteractionDeps;
}

// --- Session ---

type Point = { readonly x: number; readonly y: number };

interface MousedownSnapshot {
	readonly origin: Point;
	readonly elementId: string;
	readonly trackId: string;
	readonly startElementTime: MediaTime;
	readonly clickOffsetTime: MediaTime;
	readonly selectedElements: readonly ElementRef[];
}

interface DragProgress {
	moveGroup: MoveGroup;
	// Pre-minted per member so the identity of any "new track" created by
	// this drag stays stable across mousemove-driven drop-target recomputes.
	// `resolveGroupMoveForDrop` runs every mousemove and emits a
	// `createTracks[]` carrying these IDs; downstream consumers (snap
	// indicator, drop-line, commit path) see the same entity every frame
	// instead of a churning UUID.
	reservedNewTrackIds: readonly string[];
	currentTime: MediaTime;
	currentMouseX: number;
	currentMouseY: number;
	groupMoveResult: GroupMoveResult | null;
	dropTarget: DropTarget | null;
}

type Session =
	| { kind: "idle" }
	| { kind: "pending"; mousedown: MousedownSnapshot }
	| { kind: "dragging"; mousedown: MousedownSnapshot; drag: DragProgress };

const IDLE_VIEW: ElementDragView = { kind: "idle" };

// --- Pure helpers ---

function pixelToClickOffsetTime({
	clientX,
	elementRect,
	zoomLevel,
}: {
	clientX: number;
	elementRect: DOMRect;
	zoomLevel: number;
}): MediaTime {
	const clickOffsetX = clientX - elementRect.left;
	const seconds = clickOffsetX / (BASE_TIMELINE_PIXELS_PER_SECOND * zoomLevel);
	return mediaTime({ ticks: Math.round(seconds * TICKS_PER_SECOND) });
}

function verticalDirection({
	startMouseY,
	currentMouseY,
}: {
	startMouseY: number;
	currentMouseY: number;
}): "up" | "down" | null {
	if (currentMouseY < startMouseY) return "up";
	if (currentMouseY > startMouseY) return "down";
	return null;
}

function orderedTracks(sceneTracks: SceneTracks): TimelineTrack[] {
	return [...sceneTracks.overlay, sceneTracks.main, ...sceneTracks.audio];
}

function movedPastDragThreshold({
	current,
	origin,
}: {
	current: Point;
	origin: Point;
}): boolean {
	return (
		Math.abs(current.x - origin.x) > TIMELINE_DRAG_THRESHOLD_PX ||
		Math.abs(current.y - origin.y) > TIMELINE_DRAG_THRESHOLD_PX
	);
}

function frameSnappedMouseTime({
	clientX,
	scrollContainer,
	zoomLevel,
	clickOffsetTime,
	fps,
}: {
	clientX: number;
	scrollContainer: HTMLDivElement;
	zoomLevel: number;
	clickOffsetTime: MediaTime;
	fps: FrameRate;
}): MediaTime {
	const mouseTime = getMouseTimeFromClientX({
		clientX,
		containerRect: scrollContainer.getBoundingClientRect(),
		zoomLevel,
		scrollLeft: scrollContainer.scrollLeft,
	});
	const adjusted = maxMediaTime({
		a: ZERO_MEDIA_TIME,
		b: subMediaTime({ a: mouseTime, b: clickOffsetTime }),
	});
	return roundFrameTime({ time: adjusted, fps });
}

function resolveDropTarget({
	clientX,
	clientY,
	elementId,
	trackId,
	tracks,
	viewport,
	zoomLevel,
	snappedTime,
	verticalDragDirection,
}: {
	clientX: number;
	clientY: number;
	elementId: string;
	trackId: string;
	tracks: SceneTracks;
	viewport: ViewportAdapter;
	zoomLevel: number;
	snappedTime: MediaTime;
	verticalDragDirection: "up" | "down" | null;
}): DropTarget | null {
	const containerRect = viewport
		.getTracksContainerEl()
		?.getBoundingClientRect();
	const scrollContainer = viewport.getTracksScrollEl();
	if (!containerRect || !scrollContainer) return null;

	const sourceTrack = orderedTracks(tracks).find(({ id }) => id === trackId);
	const movingElement = sourceTrack?.elements.find(
		({ id }) => id === elementId,
	);
	if (!movingElement) return null;

	const scrollRect = scrollContainer.getBoundingClientRect();
	const headerHeight =
		viewport.getHeaderEl()?.getBoundingClientRect().height ?? 0;

	return computeDropTarget({
		elementType: movingElement.type,
		mouseX: clientX - scrollRect.left + scrollContainer.scrollLeft,
		mouseY: clientY - scrollRect.top + scrollContainer.scrollTop - headerHeight,
		tracks,
		playheadTime: snappedTime,
		isExternalDrop: false,
		elementDuration: movingElement.duration,
		pixelsPerSecond: BASE_TIMELINE_PIXELS_PER_SECOND,
		zoomLevel,
		startTimeOverride: snappedTime,
		excludeElementId: movingElement.id,
		verticalDragDirection,
	});
}

function resolveGroupMoveForDrop({
	group,
	tracks,
	anchorStartTime,
	dropTarget,
	reservedNewTrackIds,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	anchorStartTime: MediaTime;
	dropTarget: DropTarget;
	reservedNewTrackIds: readonly string[];
}): GroupMoveResult | null {
	const newTracksFallback = () =>
		resolveGroupMove({
			group,
			tracks,
			anchorStartTime,
			target: {
				kind: "newTracks",
				anchorInsertIndex: dropTarget.trackIndex,
				newTrackIds: [...reservedNewTrackIds],
			},
		});

	if (dropTarget.isNewTrack) return newTracksFallback();

	const targetTrack = orderedTracks(tracks)[dropTarget.trackIndex];
	if (!targetTrack) return null;

	return (
		resolveGroupMove({
			group,
			tracks,
			anchorStartTime,
			target: { kind: "existingTrack", anchorTargetTrackId: targetTrack.id },
		}) ?? newTracksFallback()
	);
}

// --- Controller ---

export class ElementInteractionController {
	private session: Session = { kind: "idle" };
	// True once the active gesture crossed the drag threshold. Read by
	// onElementClick, which fires after mouseup — by which point the session
	// has already returned to idle, so the "was this a drag?" answer must
	// outlive the session. Reset on the next mousedown.
	private lastGestureWasDrag = false;
	// touchend 可能带不上 changedTouches（系统打断手势时），留一个最后已知坐标兜底。
	private lastPointer = { clientX: 0, clientY: 0 };

	private readonly subscribers = new Set<() => void>();
	private readonly depsRef: ElementInteractionDepsRef;

	constructor(args: { depsRef: ElementInteractionDepsRef }) {
		this.depsRef = args.depsRef;
	}

	private get deps(): ElementInteractionDeps {
		return this.depsRef.current;
	}

	get view(): ElementDragView {
		if (this.session.kind !== "dragging") return IDLE_VIEW;
		const { mousedown, drag } = this.session;
		const memberTimeOffsets = new Map<string, MediaTime>();
		for (const member of drag.moveGroup.members) {
			memberTimeOffsets.set(member.elementId, member.timeOffset);
		}
		return {
			kind: "dragging",
			anchorElementId: mousedown.elementId,
			trackId: mousedown.trackId,
			memberTimeOffsets,
			startMouseX: mousedown.origin.x,
			startMouseY: mousedown.origin.y,
			startElementTime: mousedown.startElementTime,
			clickOffsetTime: mousedown.clickOffsetTime,
			currentTime: drag.currentTime,
			currentMouseX: drag.currentMouseX,
			currentMouseY: drag.currentMouseY,
			dropTarget: drag.dropTarget,
		};
	}

	get isActive(): boolean {
		return this.session.kind !== "idle";
	}

	subscribe(fn: () => void): () => void {
		this.subscribers.add(fn);
		return () => this.subscribers.delete(fn);
	}

	cancel = (): void => {
		this.lastGestureWasDrag = false;
		this.finishSession();
	};

	destroy(): void {
		this.cancel();
		this.subscribers.clear();
	}

	onElementMouseDown = ({
		event,
		element,
		track,
	}: {
		event: ReactMouseEvent;
		element: TimelineElement;
		track: TimelineTrack;
	}): void => {
		// Right-click must not stopPropagation — ContextMenu needs the bubble.
		if (event.button === MOUSE_BUTTON_RIGHT) {
			const ref = { trackId: track.id, elementId: element.id };
			if (!this.deps.selection.isSelected(ref)) {
				this.deps.selection.handleClick({ ...ref, isMultiKey: false });
			}
			return;
		}

		event.stopPropagation();
		this.beginPress({
			clientX: event.clientX,
			clientY: event.clientY,
			elementRect: event.currentTarget.getBoundingClientRect(),
			isMultiKey: event.metaKey || event.ctrlKey || event.shiftKey,
			element,
			track,
		});
	};

	/**
	 * 触屏上 Chrome 只在抬指那一刻补发 mousedown，靠 mouse 起手跟不上手指，
	 * 所以 touchstart 直接开同一个会话，后续由 touchmove 连续喂坐标。
	 */
	onElementTouchStart = ({
		event,
		element,
		track,
	}: {
		event: ReactTouchEvent;
		element: TimelineElement;
		track: TimelineTrack;
	}): void => {
		const touch = event.touches[0];
		if (!touch) return;

		event.stopPropagation();
		this.beginPress({
			clientX: touch.clientX,
			clientY: touch.clientY,
			elementRect: event.currentTarget.getBoundingClientRect(),
			isMultiKey: false,
			element,
			track,
		});
	};

	private beginPress({
		clientX,
		clientY,
		elementRect,
		isMultiKey,
		element,
		track,
	}: {
		clientX: number;
		clientY: number;
		elementRect: DOMRect;
		isMultiKey: boolean;
		element: TimelineElement;
		track: TimelineTrack;
	}): void {
		this.lastGestureWasDrag = false;
		this.lastPointer = { clientX, clientY };

		const ref = { trackId: track.id, elementId: element.id };

		if (isMultiKey) {
			this.deps.selection.handleClick({ ...ref, isMultiKey: true });
		}

		const selectedElements = this.deps.selection.isSelected(ref)
			? this.deps.selection.getSelected()
			: [ref];

		this.session = {
			kind: "pending",
			mousedown: {
				origin: { x: clientX, y: clientY },
				elementId: element.id,
				trackId: track.id,
				startElementTime: element.startTime,
				clickOffsetTime: pixelToClickOffsetTime({
					clientX,
					elementRect,
					zoomLevel: this.deps.viewport.getZoomLevel(),
				}),
				selectedElements,
			},
		};
		this.activate();
		this.notify();
	}

	onElementClick = ({
		event,
		element,
		track,
	}: {
		event: ReactMouseEvent;
		element: TimelineElement;
		track: TimelineTrack;
	}): void => {
		event.stopPropagation();

		if (this.lastGestureWasDrag) {
			this.lastGestureWasDrag = false;
			return;
		}

		if (event.metaKey || event.ctrlKey || event.shiftKey) return;

		const ref = { trackId: track.id, elementId: element.id };
		if (
			!this.deps.selection.isSelected(ref) ||
			this.deps.selection.getSelected().length > 1
		) {
			this.deps.selection.select(ref);
			return;
		}

		this.deps.selection.clearKeyframeSelection();
	};

	private activate(): void {
		document.addEventListener("mousemove", this.handleMouseMove);
		document.addEventListener("mouseup", this.handleMouseUp);
		// 手指一动就不会再派发 mousemove，片段拖拽要自己接住 touch。
		document.addEventListener("touchmove", this.handleTouchMove, {
			passive: false,
		});
		document.addEventListener("touchend", this.handleTouchEnd);
		document.addEventListener("touchcancel", this.handleTouchEnd);
	}

	private deactivate(): void {
		document.removeEventListener("mousemove", this.handleMouseMove);
		document.removeEventListener("mouseup", this.handleMouseUp);
		document.removeEventListener("touchmove", this.handleTouchMove);
		document.removeEventListener("touchend", this.handleTouchEnd);
		document.removeEventListener("touchcancel", this.handleTouchEnd);
	}

	private notify(): void {
		for (const fn of this.subscribers) fn();
	}

	private finishSession(): void {
		this.session = { kind: "idle" };
		this.deactivate();
		this.deps.snap.onChange?.(null);
		this.notify();
	}

	private snapResult({
		frameSnappedTime,
		group,
	}: {
		frameSnappedTime: MediaTime;
		group: MoveGroup;
	}): { snappedTime: MediaTime; snapPoint: SnapPoint | null } {
		const { snap, input, scene, viewport, playback } = this.deps;

		if (!snap.isEnabled() || input.isShiftHeld()) {
			return { snappedTime: frameSnappedTime, snapPoint: null };
		}

		const result = snapGroupEdges({
			group,
			anchorStartTime: frameSnappedTime,
			tracks: scene.getTracks(),
			playheadTime: playback.getCurrentTime(),
			zoomLevel: viewport.getZoomLevel(),
		});

		return {
			snappedTime: result.snappedAnchorStartTime,
			snapPoint: result.snapPoint,
		};
	}

	private updateDropTarget({
		clientX,
		clientY,
		mousedown,
		drag,
		snappedTime,
	}: {
		clientX: number;
		clientY: number;
		mousedown: MousedownSnapshot;
		drag: DragProgress;
		snappedTime: MediaTime;
	}): void {
		const { scene, viewport } = this.deps;
		const tracks = scene.getTracks();
		const zoomLevel = viewport.getZoomLevel();

		const anchorDropTarget = resolveDropTarget({
			clientX,
			clientY,
			elementId: mousedown.elementId,
			trackId: mousedown.trackId,
			tracks,
			viewport,
			zoomLevel,
			snappedTime,
			verticalDragDirection: verticalDirection({
				startMouseY: mousedown.origin.y,
				currentMouseY: clientY,
			}),
		});

		const nextGroupMoveResult = anchorDropTarget
			? resolveGroupMoveForDrop({
					group: drag.moveGroup,
					tracks,
					anchorStartTime: snappedTime,
					dropTarget: anchorDropTarget,
					reservedNewTrackIds: drag.reservedNewTrackIds,
				})
			: null;

		drag.groupMoveResult = nextGroupMoveResult;
		drag.dropTarget =
			anchorDropTarget && (anchorDropTarget.isNewTrack || !nextGroupMoveResult)
				? { ...anchorDropTarget, isNewTrack: true }
				: null;
	}

	private handleMouseMove = ({
		clientX,
		clientY,
	}: {
		clientX: number;
		clientY: number;
	}): void => {
		const scrollContainer = this.deps.viewport.getTracksScrollEl();
		if (!scrollContainer) return;

		if (this.session.kind === "pending") {
			this.beginDragFromPending({
				mousedown: this.session.mousedown,
				clientX,
				clientY,
				scrollContainer,
			});
			return;
		}

		if (this.session.kind === "dragging") {
			this.updateActiveDrag({
				mousedown: this.session.mousedown,
				drag: this.session.drag,
				clientX,
				clientY,
				scrollContainer,
			});
		}
	};

	private beginDragFromPending({
		mousedown,
		clientX,
		clientY,
		scrollContainer,
	}: {
		mousedown: MousedownSnapshot;
		clientX: number;
		clientY: number;
		scrollContainer: HTMLDivElement;
	}): void {
		if (
			!movedPastDragThreshold({
				current: { x: clientX, y: clientY },
				origin: mousedown.origin,
			})
		) {
			return;
		}

		const fps = this.deps.scene.getActiveFps();
		if (!fps) return;

		const moveGroup = buildMoveGroup({
			anchorRef: {
				trackId: mousedown.trackId,
				elementId: mousedown.elementId,
			},
			selectedElements: [...mousedown.selectedElements],
			tracks: this.deps.scene.getTracks(),
		});
		if (!moveGroup) return;

		const zoomLevel = this.deps.viewport.getZoomLevel();
		const frameSnappedTime = frameSnappedMouseTime({
			clientX,
			scrollContainer,
			zoomLevel,
			clickOffsetTime: mousedown.clickOffsetTime,
			fps,
		});
		const { snappedTime, snapPoint } = this.snapResult({
			frameSnappedTime,
			group: moveGroup,
		});

		// Ensure the anchor is selected before we render the drag — covers the
		// case where the selection store hasn't committed the mousedown-time
		// selection click yet.
		const anchorRef = {
			trackId: mousedown.trackId,
			elementId: mousedown.elementId,
		};
		if (!this.deps.selection.isSelected(anchorRef)) {
			this.deps.selection.select(anchorRef);
		}

		const drag: DragProgress = {
			moveGroup,
			reservedNewTrackIds: moveGroup.members.map(() => generateUUID()),
			currentTime: snappedTime,
			currentMouseX: clientX,
			currentMouseY: clientY,
			groupMoveResult: null,
			dropTarget: null,
		};

		this.session = { kind: "dragging", mousedown, drag };
		this.lastGestureWasDrag = true;

		this.updateDropTarget({
			clientX,
			clientY,
			mousedown,
			drag,
			snappedTime,
		});

		this.deps.snap.onChange?.(snapPoint);
		this.notify();
	}

	private updateActiveDrag({
		mousedown,
		drag,
		clientX,
		clientY,
		scrollContainer,
	}: {
		mousedown: MousedownSnapshot;
		drag: DragProgress;
		clientX: number;
		clientY: number;
		scrollContainer: HTMLDivElement;
	}): void {
		const fps = this.deps.scene.getActiveFps();
		if (!fps) return;

		const frameSnappedTime = frameSnappedMouseTime({
			clientX,
			scrollContainer,
			zoomLevel: this.deps.viewport.getZoomLevel(),
			clickOffsetTime: mousedown.clickOffsetTime,
			fps,
		});
		const { snappedTime, snapPoint } = this.snapResult({
			frameSnappedTime,
			group: drag.moveGroup,
		});

		drag.currentTime = snappedTime;
		drag.currentMouseX = clientX;
		drag.currentMouseY = clientY;

		this.updateDropTarget({
			clientX,
			clientY,
			mousedown,
			drag,
			snappedTime,
		});

		this.deps.snap.onChange?.(snapPoint);
		this.notify();
	}

	private handleMouseUp = ({
		clientX,
		clientY,
	}: {
		clientX: number;
		clientY: number;
	}): void => {
		if (this.session.kind === "pending") {
			this.finishSession();
			return;
		}

		if (this.session.kind !== "dragging") return;

		const { mousedown, drag } = this.session;

		// If the drag returned within the click threshold of its origin, treat
		// this as a cancel rather than a commit — the user dragged then put the
		// element back.
		if (
			!movedPastDragThreshold({
				current: { x: clientX, y: clientY },
				origin: mousedown.origin,
			})
		) {
			this.lastGestureWasDrag = false;
			this.finishSession();
			return;
		}

		const { moveGroup, groupMoveResult } = drag;
		if (!groupMoveResult) {
			this.finishSession();
			return;
		}

		const didMove = groupMoveResult.moves.some((move) => {
			const member = moveGroup.members.find(
				(m) => m.elementId === move.elementId,
			);
			const originalStartTime =
				mousedown.startElementTime + (member?.timeOffset ?? 0);
			return (
				member?.trackId !== move.targetTrackId ||
				originalStartTime !== move.newStartTime
			);
		});

		if (didMove || groupMoveResult.createTracks.length > 0) {
			this.deps.timeline.moveElements({
				moves: groupMoveResult.moves,
				createTracks: groupMoveResult.createTracks,
			});
		}

		this.finishSession();
	};

	private handleTouchMove = (event: TouchEvent): void => {
		const touch = event.touches[0];
		if (!touch) return;

		const { clientX, clientY } = touch;
		this.lastPointer = { clientX, clientY };

		if (this.session.kind !== "idle" && !isAndroidUI()) {
			const { origin } = this.session.mousedown;
			const dx = Math.abs(clientX - origin.x);
			const dy = Math.abs(clientY - origin.y);
			// 竖着划是想滚轨道列表，让给浏览器；只有横向占优的位移才接管成拖拽。
			if (dy > dx && dy > TIMELINE_DRAG_THRESHOLD_PX) {
				this.cancel();
				return;
			}
		}
		// 手机上这条让渡必须整个关掉：片段体已经是 touch-action:none（见 android.css），
		// 浏览器滚不动了，再 cancel 就等于把用户这次拖拽白白丢掉 —— 素材原地回弹。
		// 而且拇指起手常带上飘，按「相对起点的 dy>dx」判轴会在头几像素就误杀整次拖拽。
		// 手机上一律跟随手指：横向改时间、竖向换轨道，跟剪映一致。

		// 手指位移不拦就被判成页面滚动，拖拽会一直停在按下那一刻。
		event.preventDefault();
		this.handleMouseMove({ clientX, clientY });
	};

	private handleTouchEnd = (event: TouchEvent): void => {
		const { clientX, clientY } = event.changedTouches[0] ?? this.lastPointer;
		this.handleMouseUp({ clientX, clientY });
	};
}
