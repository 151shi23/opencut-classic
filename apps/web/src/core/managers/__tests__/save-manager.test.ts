import { describe, expect, mock, test } from "bun:test";

import type { EditorCore } from "@/core";

mock.module("sonner", () => ({
	toast: {
		error: mock(() => {}),
		dismiss: mock(() => {}),
	},
}));

const { SaveManager } = await import("@/core/managers/save-manager");
const { toast } = await import("sonner");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function makeEditor({
	saveImpl,
	active = { id: "p1" } as Record<string, unknown> | null,
}: {
	saveImpl: () => Promise<void>;
	active?: Record<string, unknown> | null;
}) {
	const subscribe = () => () => {};
	return {
		scenes: { subscribe },
		timeline: { subscribe },
		project: {
			getActiveOrNull: () => active,
			getIsLoading: () => false,
			getMigrationState: () => ({ isMigrating: false }),
			saveCurrentProject: saveImpl,
		},
	} as unknown as EditorCore;
}

describe("SaveManager", () => {
	test("落盘成功后才清脏", async () => {
		let saved = 0;
		const manager = new SaveManager({
			editor: makeEditor({
				saveImpl: async () => {
					saved += 1;
				},
			}),
			debounceMs: 5,
		});

		manager.markDirty();
		await sleep(30);

		expect(saved).toBe(1);
		expect(manager.getIsDirty()).toBe(false);
	});

	test("一直失败时脏标记不清，并持续重试", async () => {
		let attempts = 0;
		const manager = new SaveManager({
			editor: makeEditor({
				saveImpl: async () => {
					attempts += 1;
					throw new Error("QuotaExceededError");
				},
			}),
			debounceMs: 5,
		});

		manager.markDirty();
		await sleep(60);

		expect(attempts).toBeGreaterThanOrEqual(2);
		expect(manager.getIsDirty()).toBe(true);
		expect(manager.getFailureCount()).toBe(attempts);
		expect(toast.error).toHaveBeenCalled();

		// 退避重试链会一直排下去，不收尾会把定时器留给后面的测试
		manager.stop();
	});

	test("先失败后成功：自动恢复、清脏、撤掉提示", async () => {
		let attempts = 0;
		const manager = new SaveManager({
			editor: makeEditor({
				saveImpl: async () => {
					attempts += 1;
					if (attempts === 1) throw new Error("QuotaExceededError");
				},
			}),
			debounceMs: 5,
		});

		manager.markDirty();
		await sleep(60);

		expect(attempts).toBeGreaterThanOrEqual(2);
		expect(manager.getIsDirty()).toBe(false);

		expect(await manager.flush()).toBe(true);
		expect(toast.dismiss).toHaveBeenCalled();
	});

	test("没有 active 工程时不抛异常（closeProject 会走到这条链）", async () => {
		let calls = 0;
		const manager = new SaveManager({
			editor: makeEditor({
				active: null,
				saveImpl: async () => {
					calls += 1;
				},
			}),
			debounceMs: 5,
		});

		manager.markDirty();
		await sleep(30);

		expect(calls).toBe(0);
	});

	test("discardPending 丢掉待存意图，不会把旧工程写进新工程", async () => {
		let calls = 0;
		const manager = new SaveManager({
			editor: makeEditor({
				saveImpl: async () => {
					calls += 1;
				},
			}),
			debounceMs: 5,
		});

		manager.markDirty();
		manager.discardPending();
		await sleep(30);

		expect(calls).toBe(0);
		expect(manager.getIsDirty()).toBe(false);
	});
});
