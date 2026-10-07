/**
 * 工程记录存在但读不出可用结构。
 *
 * 必须和"工程不存在"区分开：以前两者都返回 null，调用方一律按"没有"处理，
 * 于是打开一个损坏工程会**静默新建一个同名空工程** —— 原数据其实还在 IndexedDB 里，
 * 但用户看到的就是"我的工程被删了"。损坏要报错、要留在原地等修复，不能顶替。
 */
export class MalformedProjectError extends Error {
	readonly projectId: string;

	constructor(projectId: string) {
		super(`Project ${projectId} is damaged and could not be read`);
		this.name = "MalformedProjectError";
		this.projectId = projectId;
	}
}

/*
 * 只用 name 判定，不靠 instanceof：打包器会把这类复制进多个 chunk
 * （实测 out/ 里同一份定义出现在两个 chunk 中），抛出方和捕获方各自拿着
 * 不同的类对象时 instanceof 会静默失效 —— 坏工程又会退化成普通加载失败。
 */
export function isMalformedProjectError(
	error: unknown,
): error is MalformedProjectError {
	return (
		typeof error === "object" &&
		error !== null &&
		(error as { name?: unknown }).name === "MalformedProjectError"
	);
}
