import { describe, expect, it } from "bun:test";
import { looksLikeProject } from "../runner";
import type { ProjectRecord } from "../transformers/types";

const asRecord = (value: unknown): ProjectRecord => value as ProjectRecord;

describe("looksLikeProject", () => {
	it("accepts records that carry any real project shape", () => {
		expect(looksLikeProject({ project: asRecord({ version: 31 }) })).toBe(true);
		expect(looksLikeProject({ project: asRecord({ scenes: [] }) })).toBe(true);
		expect(
			looksLikeProject({ project: asRecord({ metadata: { name: "a" } }) }),
		).toBe(true);
		// v0 把 name 直接挂在顶层
		expect(looksLikeProject({ project: asRecord({ name: "old" }) })).toBe(true);
	});

	it("refuses a record that only has an id", () => {
		// 这类残缺记录以前会被 getProjectVersion 认成 v0，然后被迁移器补出一份
		// 完整但全空的工程 —— "损坏"就这样被洗成了"工程变空了"
		expect(looksLikeProject({ project: asRecord({ id: "x" }) })).toBe(false);
		expect(looksLikeProject({ project: asRecord({}) })).toBe(false);
		expect(
			looksLikeProject({ project: asRecord({ id: "x", settings: null }) }),
		).toBe(false);
	});
});
