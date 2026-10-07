import { toast } from "sonner";
import type { EditorCore } from "@/core";

type SaveManagerOptions = {
	debounceMs?: number;
};

const SAVE_TOAST_ID = "project-save-failed";
const MAX_RETRY_DELAY_MS = 30_000;

/**
 * 自动保存。以前失败是彻底静默的：脏标记在真正落盘**之前**就被清掉，
 * saveCurrentProject 又把异常吞成一句 console.error，于是"保存失败"和
 * "保存成功"在用户看来一模一样，改动直接蒸发。现在改成：
 * 只有落盘成功才清脏；失败保留脏并退避重试；连续失败给一条可dismiss的提示。
 */
export class SaveManager {
	private debounceMs: number;
	private isPaused = false;
	private isSaving = false;
	private hasPendingSave = false;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private unsubscribeHandlers: Array<() => void> = [];
	private failureCount = 0;

	constructor({
		editor,
		debounceMs = 800,
	}: {
		editor: EditorCore;
	} & SaveManagerOptions) {
		this.editor = editor;
		this.debounceMs = debounceMs;
	}

	private editor: EditorCore;

	start(): void {
		if (this.unsubscribeHandlers.length > 0) return;

		this.unsubscribeHandlers = [
			this.editor.scenes.subscribe(() => {
				this.markDirty();
			}),
			this.editor.timeline.subscribe(() => {
				this.markDirty();
			}),
		];
	}

	stop(): void {
		for (const unsubscribe of this.unsubscribeHandlers) {
			unsubscribe();
		}
		this.unsubscribeHandlers = [];
		this.clearTimer();
	}

	pause(): void {
		this.isPaused = true;
	}

	resume(): void {
		this.isPaused = false;
		if (this.hasPendingSave) {
			this.queueSave();
		}
	}

	markDirty({ force = false }: { force?: boolean } = {}): void {
		if (this.isPaused && !force) return;
		this.hasPendingSave = true;
		this.queueSave();
	}

	/** 落盘并等真结果；返回是否真的存下了（退出、切工程前要用）。 */
	async flush(): Promise<boolean> {
		this.hasPendingSave = true;
		return await this.saveNow();
	}

	getIsDirty(): boolean {
		return this.hasPendingSave || this.isSaving;
	}

	getFailureCount(): number {
		return this.failureCount;
	}

	/** 工程已关闭/切换：丢掉待存意图，别把上一个工程的状态写进下一个。 */
	discardPending(): void {
		this.hasPendingSave = false;
		this.clearTimer();
	}

	private queueSave(delay?: number): void {
		if (this.isSaving) return;
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
		}
		this.saveTimer = setTimeout(() => {
			this.saveTimer = null;
			void this.saveNow();
		}, delay ?? this.debounceMs);
	}

	private async saveNow(): Promise<boolean> {
		if (this.isSaving) return false;
		if (!this.hasPendingSave) return false;

		// 这里必须用不会 throw 的取值：closeProject 会先清空 active 再清场景，
		// 那条订阅链正好会走到这里
		const activeProject = this.editor.project.getActiveOrNull();
		if (!activeProject) return false;
		if (this.editor.project.getIsLoading()) return false;
		if (this.editor.project.getMigrationState().isMigrating) return false;

		this.isSaving = true;
		this.clearTimer();

		try {
			await this.editor.project.saveCurrentProject();
			this.hasPendingSave = false;
			if (this.failureCount > 0) {
				this.failureCount = 0;
				toast.dismiss(SAVE_TOAST_ID);
			}
			return true;
		} catch (error) {
			this.failureCount += 1;
			console.error("Failed to save project:", error);

			const reason =
				error instanceof Error ? error.message : "未知错误（存储可能已满）";
			// 只在第一次失败时提示，重试期间不刷屏
			toast.error("工程保存失败，正在自动重试", {
				id: SAVE_TOAST_ID,
				description: `${reason}（第 ${this.failureCount} 次）`,
				duration: Infinity,
			});

			// 脏标记不清，退避后再试；上限 30s，避免每 800ms 撞一次配额
			const delay = Math.min(
				MAX_RETRY_DELAY_MS,
				this.debounceMs * 2 ** Math.min(this.failureCount, 6),
			);
			this.queueSave(delay);
			return false;
		} finally {
			this.isSaving = false;
			if (this.hasPendingSave && !this.saveTimer) {
				this.queueSave();
			}
		}
	}

	private clearTimer(): void {
		if (!this.saveTimer) return;
		clearTimeout(this.saveTimer);
		this.saveTimer = null;
	}
}
