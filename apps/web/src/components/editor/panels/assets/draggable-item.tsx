"use client";

import { Plus } from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditor } from "@/editor/use-editor";
import { isAndroidUI } from "@/android/detect";
import type { TimelineDragData } from "@/timeline/drag";
import { cn } from "@/utils/ui";
import type { MediaTime } from "@/wasm";

export interface DraggableItemProps {
	name: string;
	preview: ReactNode;
	dragData: TimelineDragData;
	onDragStart?: ({ e }: { e: React.DragEvent }) => void;
	onAddToTimeline?: ({ currentTime }: { currentTime: MediaTime }) => void;
	aspectRatio?: number;
	className?: string;
	containerClassName?: string;
	shouldShowPlusOnDrag?: boolean;
	shouldShowLabel?: boolean;
	isRounded?: boolean;
	/** 触屏没有 hover，加号默认 opacity-0 就永远看不见。需要点按添加的项目要打开。 */
	plusAlwaysVisible?: boolean;
	variant?: "card" | "compact";
	isDraggable?: boolean;
}

/** 跟随手指的素材浮层是 80px 见方，锚点取中心。 */
const GHOST_SIZE_PX = 80;

export function DraggableItem({
	name,
	preview,
	dragData,
	onDragStart,
	onAddToTimeline,
	aspectRatio = 16 / 9,
	className = "",
	containerClassName,
	shouldShowPlusOnDrag = true,
	shouldShowLabel = true,
	isRounded = true,
	plusAlwaysVisible = false,
	variant = "card",
	isDraggable = true,
}: DraggableItemProps) {
	const [isDragging, setIsDragging] = useState(false);
	const dragRef = useRef<HTMLDivElement>(null);
	const ghostRef = useRef<HTMLDivElement | null>(null);
	/** 手指位置：直接写进 transform，不走 state，避免每帧重渲染整张卡片。 */
	const dragPointRef = useRef({ x: 0, y: 0 });
	const editor = useEditor();

	const applyGhostPosition = useCallback(() => {
		const ghost = ghostRef.current;
		if (!ghost) return;
		const offset = GHOST_SIZE_PX / 2;
		ghost.style.transform = `translate3d(${dragPointRef.current.x - offset}px, ${dragPointRef.current.y - offset}px, 0)`;
	}, []);

	const handleAddToTimeline = () => {
		onAddToTimeline?.({ currentTime: editor.playback.getCurrentTime() });
	};

	const emptyImg = new window.Image();
	emptyImg.src =
		"data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=";

	useEffect(() => {
		if (!isDragging) return;

		const dragSource = editor.timeline.dragSource;
		const endDrag = () => setIsDragging(false);

		const handleDragOver = (e: DragEvent) => {
			dragPointRef.current = { x: e.clientX, y: e.clientY };
			applyGhostPosition();
		};

		const handleVisibilityChange = () => {
			if (document.hidden) endDrag();
		};

		// 安卓 WebView 的触屏拖拽不保证补发 dragend，拖拽被系统打断时浮层（素材示例图）
		// 就会一直压在画面上、切面板也走不掉。dragend 之外的收尾路径全部兜上。
		document.addEventListener("dragover", handleDragOver);
		document.addEventListener("dragend", endDrag);
		document.addEventListener("drop", endDrag);
		document.addEventListener("visibilitychange", handleVisibilityChange);
		// 拖拽进行中不会再有 pointerdown：出现新的一次按下，说明上一次拖拽已经结束
		// （被系统菜单掐断的那种就不会补 dragend 了），浮层该收了。
		document.addEventListener("pointerdown", endDrag, true);
		window.addEventListener("pagehide", endDrag);

		return () => {
			document.removeEventListener("dragover", handleDragOver);
			document.removeEventListener("dragend", endDrag);
			document.removeEventListener("drop", endDrag);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			document.removeEventListener("pointerdown", endDrag, true);
			window.removeEventListener("pagehide", endDrag);
			// 卸载 / 复位都统一结束拖拽会话，否则时间线会一直以为还在拖。
			dragSource.end();
		};
	}, [isDragging, editor, applyGhostPosition]);

	const handleDragStart = (event: React.DragEvent) => {
		event.dataTransfer.setDragImage(emptyImg, 0, 0);

		editor.timeline.dragSource.begin({
			dataTransfer: event.dataTransfer,
			dragData,
		});

		dragPointRef.current = { x: event.clientX, y: event.clientY };
		setIsDragging(true);

		onDragStart?.({ e: event });
	};

	const handleDragEnd = () => {
		setIsDragging(false);
		editor.timeline.dragSource.end();
	};

	// 长按就是拖拽的起手式：放行 contextmenu 会让系统/页面菜单抢下这个手势，
	// 模态层顺手把 body 的 pointer-events 关掉，拖拽当场夭折、界面按什么都没反应。
	const handleContextMenu = (event: React.MouseEvent) => {
		if (isAndroidUI()) event.preventDefault();
	};

	return (
		<>
			{variant === "card" ? (
				<div
					ref={dragRef}
					className={cn("group relative", containerClassName ?? "w-28")}
				>
					<div
						className={cn(
							"relative flex h-auto w-full cursor-default flex-col gap-1 p-",
							className,
						)}
					>
						<AspectRatio
							ratio={aspectRatio}
							className={cn(
								"bg-accent relative overflow-hidden",
								isRounded && "rounded-sm",
								isDraggable && "[&::-webkit-drag-ghost]:opacity-0",
							)}
							draggable={isDraggable}
							onDragStart={isDraggable ? handleDragStart : undefined}
							onDragEnd={isDraggable ? handleDragEnd : undefined}
							onContextMenu={handleContextMenu}
						>
							{preview}
							{!isDragging && (
								<PlusButton
									className={
										plusAlwaysVisible
											? "opacity-100"
											: // 隐藏的加号仍然吃点击：宫格卡片右下角正好是手指起拖的位置，
												// 按到它就不触发拖拽了。看不见的时候也别挡手。
												"pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
									}
									onClick={handleAddToTimeline}
								/>
							)}
						</AspectRatio>
						{shouldShowLabel && (
							<span
								className="text-muted-foreground w-full truncate text-left text-[0.7rem]"
								title={name}
							>
								<span className="sr-only">{name}</span>
								<span aria-hidden="true">
									{name.length > 20
										? `${name.slice(0, 16)}...${name.slice(-3)}`
										: name}
								</span>
							</span>
						)}
					</div>
				</div>
			) : (
				<div
					ref={dragRef}
					className={cn("group relative w-full", containerClassName)}
				>
					<button
						type="button"
						className={cn(
							"flex h-8 w-full cursor-default items-center gap-3 px-1 outline-none",
							isDraggable && "[&::-webkit-drag-ghost]:opacity-0",
							className,
						)}
						draggable={isDraggable}
						onDragStart={isDraggable ? handleDragStart : undefined}
						onDragEnd={isDraggable ? handleDragEnd : undefined}
						onContextMenu={handleContextMenu}
					>
						<div className="size-6 shrink-0 overflow-hidden rounded-sm">
							{preview}
						</div>
						<span className="w-full flex-1 truncate text-sm text-left">
							{name}
						</span>
					</button>
				</div>
			)}

			{isDraggable &&
				isDragging &&
				typeof document !== "undefined" &&
				createPortal(
					<div
						ref={(element) => {
							ghostRef.current = element;
							// 挂载这一帧就把位置写进去，否则浮层会先在左上角闪一下。
							applyGhostPosition();
						}}
						className="pointer-events-none fixed top-0 left-0 z-9999 will-change-transform"
					>
						<div style={{ width: `${GHOST_SIZE_PX}px` }}>
							<AspectRatio
								ratio={1}
								className="ring-primary relative overflow-hidden rounded-md shadow-2xl ring-3"
							>
								<div className="size-full [&_img]:size-full [&_img]:rounded-none [&_img]:object-cover">
									{preview}
								</div>
								{shouldShowPlusOnDrag && (
									<PlusButton
										onClick={handleAddToTimeline}
										tooltipText="Add to timeline or drag to position"
									/>
								)}
							</AspectRatio>
						</div>
					</div>,
					document.body,
				)}
		</>
	);
}

function PlusButton({
	className,
	onClick,
	tooltipText,
}: {
	className?: string;
	onClick?: () => void;
	tooltipText?: string;
}) {
	const button = (
		<Button
			size="icon"
			className={cn(
				"bg-background hover:bg-background text-foreground absolute right-2 bottom-2 size-5",
				className,
			)}
			onClick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				onClick?.();
			}}
			title={tooltipText}
		>
			<Plus />
		</Button>
	);

	if (tooltipText) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>{button}</TooltipTrigger>
				<TooltipContent>
					<p>{tooltipText}</p>
				</TooltipContent>
			</Tooltip>
		);
	}

	return button;
}
