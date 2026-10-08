import type { SceneTracks, TextElement, TimelineElement } from "@/timeline";

/**
 * 按 id 从当前轨道里找回文字元素。
 *
 * 单独成文件是为了能被单元测试拉到（控制器那条链会带进 opencut-wasm，在 bun 里加载不了）。
 *
 * 这里存在的原因是踩过一次实打实的坑：文字编辑浮层拿的是双击那一刻的**元素快照**，
 * 之后任何一次外部重渲染（在属性面板换一个字体就是一次）都会按那份快照把
 * contentEditable 的文字重写回去、参数也停在旧值上 —— 手机上就是
 * "改完字体再也打不进字，打进去的字被吞回原样"。
 */
export function findLiveTextElement({
	tracks,
	elementId,
}: {
	tracks: SceneTracks;
	elementId: string;
}): TextElement | null {
	const allTracks = [
		tracks.main,
		...tracks.overlay,
		...tracks.audio,
	] as readonly { elements: readonly TimelineElement[] }[];

	for (const track of allTracks) {
		for (const element of track.elements) {
			if (element.id === elementId) {
				return element.type === "text" ? (element as TextElement) : null;
			}
		}
	}

	return null;
}
