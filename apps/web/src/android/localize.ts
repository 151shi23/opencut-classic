import { ZH_EXACT, ZH_PATTERNS, norm } from "./zh-dictionary";

/** 我们自己写过的文本节点：这类 mutation 直接忽略，免得观察器来回触发。 */
const written = new WeakSet<Text>();

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "TITLE"]);

function translate(raw: string): string | null {
	const key = norm(raw);
	if (key.length < 1 || !/[A-Za-z]/.test(key)) return null;
	const exact = ZH_EXACT[key];
	if (exact) return key === exact ? null : exact;
	for (const [re, tpl] of ZH_PATTERNS) {
		if (re.test(key)) {
			const outText = key.replace(re, tpl);
			return outText === key ? null : outText;
		}
	}
	return null;
}

function setText(node: Text, value: string): void {
	if (node.data === value) return;
	written.add(node);
	node.data = value;
}

function translateElement(el: Element): void {
	for (const attr of ["placeholder", "title", "aria-label"] as const) {
		const v = el.getAttribute(attr);
		if (!v) continue;
		const t = translate(v);
		if (t) el.setAttribute(attr, t);
	}
}

function walkText(node: Text): void {
	const el = node.parentElement;
	// SVG 元素的 tagName 保留原大小写（<title> 就是小写），统一转大写再比对
	if (!el || SKIP_TAGS.has(el.tagName.toUpperCase()) || el.closest("[data-no-i18n]")) return;
	const t = translate(node.data);
	if (t) setText(node, t);
}

function walk(root: ParentNode): void {
	const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let node = tw.nextNode();
	while (node) {
		walkText(node as Text);
		node = tw.nextNode();
	}
	if (root instanceof Element) {
		translateElement(root);
	}
	root.querySelectorAll("[placeholder],[title],[aria-label]").forEach(translateElement);
}

let observer: MutationObserver | null = null;
let queued = false;
let pending: MutationRecord[] = [];

function flush(): void {
	queued = false;
	const records = pending;
	pending = [];
	const elements = new Set<Element>();
	for (const r of records) {
		if (r.type === "characterData") {
			if (written.has(r.target as Text)) continue;
			if ((r.target as Text).parentElement) walkText(r.target as Text);
		} else if (r.type === "attributes") {
			if (r.target instanceof Element) translateElement(r.target);
		} else {
			for (const n of r.addedNodes) {
				if (n.nodeType === Node.TEXT_NODE) walkText(n as Text);
				else if (n.nodeType === Node.ELEMENT_NODE) elements.add(n as Element);
			}
		}
	}
	// 新挂上的子树可能很深（对话框、下拉、整条时间轴），只处理仍挂在文档里的根节点
	for (const el of elements) {
		if (el.isConnected) walk(el);
	}
}

function schedule(): void {
	if (queued) return;
	queued = true;
	const run = () => {
		if (queued) flush();
	};
	// 页面被遮挡时 rAF 一帧都不给（切后台、文件选择器盖住画面），只等 rAF 会漏翻译
	if (document.hidden) setTimeout(run, 16);
	else requestAnimationFrame(run);
}

/**
 * 装上中文注入：先整篇走一遍，再用 MutationObserver 兜住后续渲染出来的
 * 面板、对话框、右键菜单（Radix 的 portal 挂在 body 下，观察 documentElement
 * 才收得到）。拖动时间轴会持续产生 mutation，所以只处理增量，不做全表扫描。
 */
export function installChinese(): void {
	walk(document.body);
	if (observer) return;
	observer = new MutationObserver((records) => {
		pending.push(...records);
		schedule();
	});
	observer.observe(document.documentElement, {
		subtree: true,
		childList: true,
		characterData: true,
		attributes: true,
		attributeFilter: ["placeholder", "title", "aria-label"],
	});
}

export function uninstallChinese(): void {
	observer?.disconnect();
	observer = null;
}
