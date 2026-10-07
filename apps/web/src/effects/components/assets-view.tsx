"use client";

import { useEffect, useRef, useCallback } from "react";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { effectsRegistry, EFFECT_TARGET_ELEMENT_TYPES, isCanvas2dEffect } from "@/effects";
import { effectPreviewService } from "@/services/renderer/effect-preview";
import { useEditor } from "@/editor/use-editor";
import { buildEffectElement } from "@/timeline/element-utils";
import type { EffectDefinition } from "@/effects/types";

export function EffectsView() {
	const effects = effectsRegistry.getAll();

	return (
		<PanelView title="Effects">
			<EffectsGrid effects={effects} />
		</PanelView>
	);
}

function EffectsGrid({ effects }: { effects: EffectDefinition[] }) {
	return (
		<div
			className="grid gap-2"
			style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}
		>
			{effects.map((effect) => (
				<EffectItem key={effect.type} effect={effect} />
			))}
		</div>
	);
}

function EffectPreviewCanvas({ effectType }: { effectType: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const render = () => {
			if (canvasRef.current) {
				effectPreviewService.renderPreview({
					effectType,
					params: {},
					targetCanvas: canvasRef.current,
				});
			}
		};

		render();
		return effectPreviewService.onPreviewImageReady({ callback: render });
	}, [effectType]);

	return <canvas ref={canvasRef} className="size-full" />;
}

function EffectItem({ effect }: { effect: EffectDefinition }) {
	const editor = useEditor();
	// Canvas2D 通道（调色 / 滤镜 / 叠加）没有整帧落点：wasm 那侧只认得已注册的
	// 着色器，所以这类特效只能挂到具体素材上。触屏没有 hover，加号要一直显示，
	// 点一下就是「给当前选中的素材加这个特效」。
	const isClipOnly = isCanvas2dEffect({ definition: effect });
	const hasClipTarget = useEditor(
		(e) => e.selection.getSelectedElements().length > 0,
	);

	const handleAddToTimeline = useCallback(() => {
		if (isClipOnly) {
			const target = editor.selection.getSelectedElements()[0];
			if (!target) return;
			editor.timeline.addClipEffect({
				trackId: target.trackId,
				elementId: target.elementId,
				effectType: effect.type,
			});
			return;
		}

		const currentTime = editor.playback.getCurrentTime();
		const element = buildEffectElement({
			effectType: effect.type,
			startTime: currentTime,
		});

		editor.timeline.insertElement({
			placement: { mode: "auto", trackType: "effect" },
			element,
		});
	}, [editor, effect.type, isClipOnly]);

	const preview = <EffectPreviewCanvas effectType={effect.type} />;

	return (
		<DraggableItem
			name={effect.name}
			preview={preview}
			dragData={{
				id: effect.type,
				name: effect.name,
				type: "effect",
				effectType: effect.type,
				targetElementTypes: EFFECT_TARGET_ELEMENT_TYPES,
			}}
			onAddToTimeline={handleAddToTimeline}
			plusAlwaysVisible={isClipOnly && hasClipTarget}
			aspectRatio={1}
			isRounded
			variant="card"
			containerClassName="w-full"
		/>
	);
}
