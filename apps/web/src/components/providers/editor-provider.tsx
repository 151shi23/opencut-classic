"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isMalformedProjectError } from "@/services/storage/errors";
import { EditorCore } from "@/core";
import { useEditor } from "@/editor/use-editor";
import { useKeybindingsListener } from "@/actions/use-keybindings";
import { useKeybindingsStore } from "@/actions/keybindings-store";
import { useTimelineStore } from "@/timeline/timeline-store";
import { useEditorActions } from "@/actions/use-editor-actions";
import { loadFontAtlas } from "@/fonts/google-fonts";
import { ensureCustomFontsRegistered } from "@/fonts/use-custom-fonts";
import {
	initializeGpuRenderer,
	isGpuAvailable,
} from "@/services/renderer/gpu-renderer";

interface EditorProviderProps {
	projectId: string;
	children: React.ReactNode;
}

export function EditorProvider({ projectId, children }: EditorProviderProps) {
	const activeProject = useEditor((e) => e.project.getActiveOrNull());
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { setLoadingProject } = useKeybindingsStore();

	useEffect(() => {
		setLoadingProject(isLoading);
	}, [isLoading, setLoadingProject]);

	useEffect(() => {
		let cancelled = false;
		const editor = EditorCore.getInstance();

		const loadProject = async () => {
			try {
				setIsLoading(true);
				await initializeGpuRenderer();
				editor.renderer.setDegraded(!isGpuAvailable());
				await editor.project.loadProject({ id: projectId });

				if (cancelled) return;

				/*
				 * 导入的字体必须赶在第一次文字排版前挂上，否则工程里的文字会回退。
				 * 以前这里是 `void ensureCustomFontsRegistered()` —— 注释写着"必须赶在
				 * 前面"，代码却是发完就不管，于是首帧（和首帧缩略图）用的是系统字体。
				 * 字体挂不上不该拦住开工程，所以 catch 掉，只等它试完。
				 */
				await ensureCustomFontsRegistered().catch(() => undefined);

				if (cancelled) return;

				setIsLoading(false);
				loadFontAtlas();
			} catch (err) {
				if (cancelled) return;

				/*
				 * 损坏必须排在"不存在"前面判：两者以前都走 null → "not found"，
				 * 于是打开一个坏工程会静默新建一个同名空工程，原数据还在库里，
				 * 用户看到的却是"工程被删了"。这里宁可停在错误屏也不顶替。
				 */
				if (isMalformedProjectError(err)) {
					setError("This project's data is damaged and cannot be opened");
					setIsLoading(false);
					return;
				}

				const isNotFound =
					err instanceof Error &&
					(err.message.includes("not found") ||
						err.message.includes("does not exist"));

				if (isNotFound) {
					try {
						const newProjectId = await editor.project.createNewProject({
							name: "Untitled Project",
						});
						// 安卓移植版：静态导出只有 /editor/new/ 一个壳，真实 id 走查询参数
						router.replace(`/editor/new?id=${newProjectId}`);
					} catch (_createErr) {
						setError("Failed to create project");
						setIsLoading(false);
					}
				} else {
					const wasmPanic = (window as Window & { __wasmPanic?: string })
						.__wasmPanic;
					if (wasmPanic) {
						delete (window as Window & { __wasmPanic?: string }).__wasmPanic;
						setError(wasmPanic);
					} else {
						setError(
							err instanceof Error ? err.message : "Failed to load project",
						);
					}
					setIsLoading(false);
				}
			}
		};

		loadProject();

		return () => {
			cancelled = true;
		};
	}, [projectId, router]);

	if (error) {
		return (
			<div className="bg-background flex h-screen w-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4 px-6 text-center">
					<p className="text-destructive text-sm">{error}</p>
					{/* 以前这块是个死屏：手机上除了杀掉 App 没有第二条出路 */}
					<Button
						variant="outline"
						size="sm"
						onClick={() => router.push("/projects")}
					>
						Back to projects
					</Button>
				</div>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="bg-background flex h-screen w-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
					<p className="text-muted-foreground text-sm">Loading project...</p>
				</div>
			</div>
		);
	}

	if (!activeProject) {
		return (
			<div className="bg-background flex h-screen w-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
					<p className="text-muted-foreground text-sm">Exiting project...</p>
				</div>
			</div>
		);
	}

	return (
		<>
			<EditorRuntimeBindings />
			{children}
		</>
	);
}

function EditorRuntimeBindings() {
	const editor = useEditor();
	const rippleEditingEnabled = useTimelineStore(
		(state) => state.rippleEditingEnabled,
	);

	useEffect(() => {
		editor.command.isRippleEnabled = rippleEditingEnabled;
	}, [editor, rippleEditingEnabled]);

	useEffect(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!editor.save.getIsDirty()) return;
			event.preventDefault();
			(event as unknown as { returnValue: string }).returnValue = "";
		};

		/*
		 * 手机上真正的丢数据路径不是关标签页，而是 WebView 被系统回收 / 用户直接切后台：
		 * beforeunload 在这些场景根本不触发，flush 也就永远不会跑。pagehide 和
		 * visibilitychange=hidden 才是可靠信号，所以这里补一次兜底落盘。
		 */
		let flushing: Promise<boolean> | null = null;
		const flushOnExit = () => {
			if (!editor.save.getIsDirty()) return;
			if (!flushing) {
				flushing = editor.save.flush().finally(() => {
					flushing = null;
				});
			}
		};

		const handleVisibility = () => {
			if (document.visibilityState === "hidden") flushOnExit();
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		window.addEventListener("pagehide", flushOnExit);
		document.addEventListener("visibilitychange", handleVisibility);
		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
			window.removeEventListener("pagehide", flushOnExit);
			document.removeEventListener("visibilitychange", handleVisibility);
		};
	}, [editor]);

	useEditorActions();
	useKeybindingsListener();
	return null;
}
