"use client";

import { useParams } from "next/navigation";
import {
	ResizablePanelGroup,
	ResizablePanel,
	ResizableHandle,
} from "@/components/ui/resizable";
import { AssetsPanel } from "@/components/editor/panels/assets";
import { PropertiesPanel } from "@/components/editor/panels/properties";
import { Timeline } from "@/timeline/components";
import { PreviewPanel } from "@/preview/components";
import { EditorHeader } from "@/components/editor/editor-header";
import { EditorProvider } from "@/components/providers/editor-provider";
import { Onboarding } from "@/components/editor/onboarding";
import { MigrationDialog } from "@/project/components/migration-dialog";
import { usePanelStore } from "@/editor/panel-store";
import { usePasteMedia } from "@/media/use-paste-media";
import { MobileGate } from "@/components/editor/mobile-gate";
import { useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useEditor } from "@/editor/use-editor";
import { useDropZoneBoost } from "@/android/use-drop-zone-boost";
import { mwPanelHandle, mwPanelProps } from "@/android/panel-toggles";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { ChangelogNotification } from "@/changelog/components/changelog-notification";
import {
	createPreviewOverlayControl,
	isPreviewOverlayVisible,
	mergePreviewOverlaySources,
} from "@/preview/overlays";
import { usePreviewStore } from "@/preview/preview-store";
import { getGuidePreviewOverlaySource } from "@/guides";
import {
	bookmarkNotesPreviewOverlay,
	getBookmarkPreviewOverlaySource,
} from "@/timeline/bookmarks/index";

// 安卓移植版：静态导出没法为每个项目预渲染动态段，只导出 /editor/new/，
// 真实项目 id 走查询参数（/editor/new/?id=xxx）—— 见 projects 页与 editor-provider 的跳转。
// generateStaticParams 在同目录 layout.tsx 里（客户端组件不能导出）。
export default function EditorPage() {
	return (
		<Suspense fallback={null}>
			<Editor />
		</Suspense>
	);
}

function Editor() {
	const params = useParams();
	const searchParams = useSearchParams();
	// 查询参数 ?id= 优先；没有（直接打开 /editor/new/）就传 "new"，
	// EditorProvider 加载不到会自动新建项目并把真实 id 写回地址栏。
	const projectId = (searchParams.get("id") || params.project_id) as string;

	return (
		<MobileGate>
			<EditorProvider projectId={projectId}>
				<div className="bg-background flex h-screen w-screen flex-col overflow-hidden">
					<DegradedRendererBanner />
					<EditorHeader />
					<div className="min-h-0 min-w-0 flex-1">
						<EditorLayout />
					</div>
					<Onboarding />
					<MigrationDialog />
					<ChangelogNotification />
				</div>
			</EditorProvider>
		</MobileGate>
	);
}

function DegradedRendererBanner() {
	const isDegraded = useEditor((e) => e.renderer.isDegraded);
	const [dismissed, setDismissed] = useState(false);
	if (!isDegraded || dismissed) return null;

	return (
		<div className="bg-accent border-b h-9 flex items-center justify-center gap-2 text-xs text-muted-foreground">
			<span>For the best experience, open OpenCut in Chrome.</span>
			<Button
				variant="text"
				size="icon"
				className="p-0 w-auto [&_svg]:size-3.5"
				onClick={() => setDismissed(true)}
				aria-label="Dismiss"
			>
				<HugeiconsIcon icon={Cancel01Icon} />
			</Button>
		</div>
	);
}

type MwPanelName =
	| "mainContent"
	| "timeline"
	| "tools"
	| "preview"
	| "properties";

/**
 * 各区的下限，同时是 saveSize 的门槛：低于这个值的尺寸多半来自「收起」，
 * 不能落进 panel-sizes，否则下次进来就是一块再也拖不回原样的窄条。
 */
const MIN_PANEL_SIZE: Record<MwPanelName, number> = {
	mainContent: 30,
	timeline: 15,
	tools: 15,
	preview: 30,
	properties: 15,
};

function EditorLayout() {
	usePasteMedia();
	const { panels, setPanel } = usePanelStore();
	useDropZoneBoost();
	// 收起区域时 onLayout 会给到一个低于 minSize 的值，别把它写进持久化尺寸：
	// 面板只吃 defaultSize，落了地下次进来就只剩一条再也拖不回来的窄缝。
	const saveSize = (panel: MwPanelName, size: number | undefined) => {
		if (size === undefined || size < MIN_PANEL_SIZE[panel] - 0.01) return;
		setPanel({ panel, size });
	};
	const activeScene = useEditor((editor) =>
		editor.scenes.getActiveSceneOrNull(),
	);
	const currentTime = useEditor((editor) => editor.playback.getCurrentTime());
	const activeGuide = usePreviewStore((state) => state.activeGuide);
	const overlays = usePreviewStore((state) => state.overlays);
	const setOverlayVisibility = usePreviewStore(
		(state) => state.setOverlayVisibility,
	);
	const showBookmarkNotes = isPreviewOverlayVisible({
		overlay: bookmarkNotesPreviewOverlay,
		overlays,
	});

	const overlaySource = useMemo(
		() =>
			mergePreviewOverlaySources({
				sources: [
					getGuidePreviewOverlaySource({
						guideId: activeGuide,
					}),
					activeScene
						? getBookmarkPreviewOverlaySource({
								bookmarks: activeScene.bookmarks,
								time: currentTime,
								isVisible: showBookmarkNotes,
							})
						: {
								definitions: [bookmarkNotesPreviewOverlay],
								instances: [],
							},
				],
			}),
		[activeGuide, activeScene, currentTime, showBookmarkNotes],
	);

	const overlayControls = useMemo(
		() =>
			overlaySource.definitions.map((overlay) =>
				createPreviewOverlayControl({ overlay, overlays }),
			),
		[overlaySource.definitions, overlays],
	);

	return (
		<ResizablePanelGroup
			direction="vertical"
			className="size-full gap-[0.18rem]"
			onLayout={(sizes) => {
				saveSize("mainContent", sizes[0]);
				saveSize("timeline", sizes[1]);
			}}
		>
			<ResizablePanel
				defaultSize={panels.mainContent}
				minSize={MIN_PANEL_SIZE.mainContent}
				maxSize={85}
				className="min-h-0"
			>
				<ResizablePanelGroup
					direction="horizontal"
					className="size-full gap-[0.19rem] px-3"
					onLayout={(sizes) => {
						saveSize("tools", sizes[0]);
						saveSize("preview", sizes[1]);
						saveSize("properties", sizes[2]);
					}}
				>
					<ResizablePanel
						{...mwPanelProps("tools")}
						defaultSize={panels.tools}
						minSize={MIN_PANEL_SIZE.tools}
						maxSize={40}
						className="min-w-0"
					>
						<AssetsPanel />
					</ResizablePanel>

					<ResizableHandle withHandle />

					<ResizablePanel
						defaultSize={panels.preview}
						minSize={MIN_PANEL_SIZE.preview}
						className="min-h-0 min-w-0 flex-1"
					>
						<PreviewPanel
							overlayControls={overlayControls}
							overlayInstances={overlaySource.instances}
							onOverlayVisibilityChange={setOverlayVisibility}
						/>
					</ResizablePanel>

					<ResizableHandle withHandle />

					<ResizablePanel
						{...mwPanelProps("properties")}
						defaultSize={panels.properties}
						minSize={MIN_PANEL_SIZE.properties}
						maxSize={40}
						className="min-w-0"
					>
						<PropertiesPanel />
					</ResizablePanel>
				</ResizablePanelGroup>
			</ResizablePanel>

			<ResizableHandle withHandle />

			{/* 工程区强制显示：只挂句柄给拖素材时的扩容用。 */}
			<ResizablePanel
				ref={mwPanelHandle("timeline")}
				defaultSize={panels.timeline}
				minSize={MIN_PANEL_SIZE.timeline}
				maxSize={70}
				className="min-h-0 px-3 pb-3"
			>
				<Timeline />
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}
