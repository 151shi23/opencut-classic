import type { EditorCore } from "@/core";
import type { Command, CommandResult } from "@/commands";
import type { EditorSelectionSnapshot } from "@/selection/editor-selection";
import { applyRippleAdjustments, computeRippleAdjustments } from "@/ripple";
import type { SceneTracks } from "@/timeline/types";

interface CommandHistoryEntry {
	command: Command;
	previousSelection: EditorSelectionSnapshot;
	selectionOverride?: EditorSelectionSnapshot;
}

/** 剪映 / CapCut 的时间轴撤销都是几十步量级；拖动与缩放每步存整条轨道快照，栈不封顶会在 WebView 的堆里越攒越多。 */
const MAX_HISTORY = 60;

export class CommandManager {
	public isRippleEnabled = false;
	private history: CommandHistoryEntry[] = [];
	private redoStack: CommandHistoryEntry[] = [];
	private reactors: Array<() => void> = [];
	private historyListeners = new Set<() => void>();

	constructor(private editor: EditorCore) {}

	execute({ command }: { command: Command }): Command {
		const beforeTracks = this.isRippleEnabled
			? (this.editor.scenes.getActiveSceneOrNull()?.tracks ?? null)
			: null;
		const previousSelection = this.getSelectionSnapshot();
		const result = command.execute();
		this.applyRippleIfEnabled({ beforeTracks });
		const selectionOverride = this.applySelectionOverride(result);
		this.runReactors();
		this.history.push({
			command,
			previousSelection,
			selectionOverride,
		});
		this.trimHistory();
		this.redoStack = [];
		this.notifyHistory();
		return command;
	}

	push({ command }: { command: Command }): void {
		this.history.push({
			command,
			previousSelection: this.getSelectionSnapshot(),
		});
		this.trimHistory();
		this.redoStack = [];
		this.notifyHistory();
	}

	subscribeHistory(listener: () => void): () => void {
		this.historyListeners.add(listener);
		return () => {
			this.historyListeners.delete(listener);
		};
	}

	registerReactor(reactor: () => void): void {
		this.reactors.push(reactor);
	}

	undo(): void {
		while (this.history.length > 0) {
			const entry = this.history.pop();
			if (!entry) {
				break;
			}
			try {
				entry.command.undo();
			} catch (error) {
				// 个别命令没实现 undo()（基类里是直接 throw）。跳过这一条继续往回退，
				// 而不是让一次撤销把编辑页崩掉；被跳过的条目不进 redoStack。
				console.error(error);
				continue;
			}
			// Only restore selection for commands that explicitly changed it.
			// Commands without selection intent leave selection untouched,
			// preserving any UI-driven selection changes (clicks, box select)
			// that happened between commands. Commands that remove editor-owned
			// selection targets must declare a selection override to clear stale refs.
			if (entry.selectionOverride !== undefined) {
				this.editor.selection.restoreSnapshot({
					snapshot: entry.previousSelection,
				});
			}
			this.redoStack.push(entry);
			break;
		}
		this.notifyHistory();
	}

	redo(): void {
		if (this.redoStack.length === 0) return;
		const entry = this.redoStack.pop();
		if (!entry) {
			return;
		}

		const beforeTracks = this.isRippleEnabled
			? (this.editor.scenes.getActiveSceneOrNull()?.tracks ?? null)
			: null;
		const previousSelection = this.getSelectionSnapshot();
		const result = entry.command.redo();
		this.applyRippleIfEnabled({ beforeTracks });
		const selectionOverride = this.applySelectionOverride(result);
		this.runReactors();

		this.history.push({
			command: entry.command,
			previousSelection,
			selectionOverride,
		});
		this.trimHistory();
		this.notifyHistory();
	}

	/** 撤销栈深度（不含撤销本身，撤销是把条目从 history 搬到 redoStack）。 */
	undoDepth(): number {
		return this.history.length;
	}

	redoDepth(): number {
		return this.redoStack.length;
	}

	canUndo(): boolean {
		return this.history.length > 0;
	}

	canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	clear(): void {
		this.history = [];
		this.redoStack = [];
		this.notifyHistory();
	}

	private trimHistory(): void {
		if (this.history.length > MAX_HISTORY) {
			this.history.splice(0, this.history.length - MAX_HISTORY);
		}
	}

	private notifyHistory(): void {
		for (const listener of [...this.historyListeners]) {
			listener();
		}
	}

	private getSelectionSnapshot(): EditorSelectionSnapshot {
		return this.editor.selection.getSnapshot();
	}

	private applySelectionOverride(
		result: CommandResult | undefined,
	): EditorSelectionSnapshot | undefined {
		if (!result?.selection) {
			return undefined;
		}
		return this.editor.selection.applySelectionPatch({
			patch: result.selection,
		});
	}

	private runReactors(): void {
		for (const reactor of this.reactors) {
			reactor();
		}
	}

	private applyRippleIfEnabled({
		beforeTracks,
	}: {
		beforeTracks: SceneTracks | null;
	}): void {
		if (!this.isRippleEnabled || !beforeTracks) {
			return;
		}

		const afterTracks = this.editor.scenes.getActiveSceneOrNull()?.tracks;
		if (!afterTracks) {
			return;
		}
		const adjustments = computeRippleAdjustments({
			beforeTracks,
			afterTracks,
		});
		if (adjustments.length === 0) {
			return;
		}

		const tracksWithRipple = applyRippleAdjustments({
			tracks: afterTracks,
			adjustments,
		});
		this.editor.timeline.updateTracks(tracksWithRipple);
	}
}
