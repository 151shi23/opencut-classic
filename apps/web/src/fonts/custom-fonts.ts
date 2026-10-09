import { IndexedDBAdapter } from "@/services/storage/indexeddb-adapter";
import { OPFSAdapter } from "@/services/storage/opfs-adapter";
import { SYSTEM_FONTS } from "@/fonts/system-fonts";
import { generateUUID } from "@/utils/id";

export interface CustomFont {
	id: string;
	family: string;
	fileName: string;
	size: number;
	addedAt: string;
	/**
	 * 字节指纹。资源服务是**同一个 slug 滚版本**的（re-zt→zt、v9→v33 都见过），
	 * 只按文件名判断"下过了"会出两种错：同名换新字身 → 永远显示已下载；
	 * 想更新又被"已经导入过了"挡住。所以更新与否必须看 sha256。
	 */
	sha256?: string;
}

/**
 * 用户自己导入的字体。
 *
 * 为什么值得单独做一套：项目里真正生效的字体字节是运行时向 fonts.googleapis.com
 * 现拉的（`google-fonts.ts` 里那条 CSS 链接），打进 APK 的 font-atlas/avif 只给
 * 字体选择器的预览图用 —— 手机上一旦没网，选了 Google 字体其实是静默回退成系统字体。
 * 本地字体走 `FontFace` 注册，排版（`ctx.font`）、预览、导出全都自动跟着走，
 * 不需要动渲染器。
 */
const FONT_DB_NAME = "video-editor-fonts";
/** 单文件上限：中文字体一个字重常见 8–30MB，再大基本不是字体而是打包集 */
const MAX_FONT_BYTES = 32 * 1024 * 1024;

export const SUPPORTED_FONT_SUFFIXES = [".ttf", ".otf", ".woff", ".woff2"];

const fontRecords = new IndexedDBAdapter<CustomFont>({
	dbName: FONT_DB_NAME,
	storeName: "fonts",
});

const fontFiles = new OPFSAdapter("custom-fonts");

const loadedFaces = new Map<string, FontFace>();

export class CustomFontError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CustomFontError";
	}
}

export function isSupportedFontFile({ fileName }: { fileName: string }): boolean {
	const lower = fileName.toLowerCase();
	return SUPPORTED_FONT_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

/**
 * `.ttc` 是字体集合，`new FontFace()` 明确不收（构造时直接抛）。用户经常把集合
 * 改名成 .ttf 再传上来，所以只看后缀不够，得嗅一下头四个字节。
 */
export function isTrueTypeCollection({
	bytes,
}: {
	bytes: Uint8Array;
}): boolean {
	if (bytes.length < 4) return false;
	return (
		bytes[0] === 0x74 &&
		bytes[1] === 0x74 &&
		bytes[2] === 0x63 &&
		bytes[3] === 0x66
	);
}

/** 用文件名当字族名：一份文件一个字重，名字里就带着字重，不会和另一份撞 */
export function fontFamilyFromFileName({ fileName }: { fileName: string }): string {
	return fileName
		.replace(/\.[^./]+$/, "")
		.replace(/[_+-]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 48);
}

export function isCustomFontFamily({ family }: { family: string }): boolean {
	return loadedFaces.has(family);
}

/** crypto.subtle 要 secure context，WebViewAssetLoader 挂的 https 域满足 */
export async function sha256Hex({
	buffer,
}: {
	buffer: ArrayBuffer;
}): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", buffer);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

async function registerFace({ record }: { record: CustomFont }): Promise<void> {
	const existing = loadedFaces.get(record.family);
	if (existing) {
		document.fonts.delete(existing);
		loadedFaces.delete(record.family);
	}

	const file = await fontFiles.get(record.id);
	if (!file) {
		throw new CustomFontError("Font file is missing from storage");
	}

	const face = new FontFace(record.family, await file.arrayBuffer());
	await face.load();
	document.fonts.add(face);
	loadedFaces.set(record.family, face);
}

export async function listCustomFonts(): Promise<CustomFont[]> {
	const records = await fontRecords.getAll();
	return records
		.filter(
			(record): record is CustomFont =>
				typeof record?.id === "string" && typeof record?.family === "string",
		)
		.sort((a, b) => a.family.localeCompare(b.family));
}

/**
 * 启动时把导入过的字体全部重新挂上。单条失败不能带走整批：文件可能被系统清理、
 * 也可能本来就是个坏字体，那种情况留着记录让用户自己删，不要悄悄改数据库。
 */
export async function registerAllCustomFonts(): Promise<CustomFont[]> {
	const registered: CustomFont[] = [];
	for (const record of await listCustomFonts()) {
		try {
			await registerFace({ record });
			registered.push(record);
		} catch (error) {
			console.warn(`[fonts] could not register ${record.family}:`, error);
		}
	}
	return registered;
}

export async function importCustomFont({
	file,
	expectedSha256,
}: {
	file: File;
	expectedSha256?: string;
}): Promise<CustomFont> {
	const fileName = file.name || "font";
	if (!isSupportedFontFile({ fileName })) {
		throw new CustomFontError("Unsupported font file type");
	}

	const buffer = await file.arrayBuffer();
	if (isTrueTypeCollection({ bytes: new Uint8Array(buffer) })) {
		throw new CustomFontError(
			"This is a font collection (.ttc). Import one .ttf or .otf file instead",
		);
	}
	if (buffer.byteLength === 0) {
		throw new CustomFontError("This font file is empty");
	}
	if (buffer.byteLength > MAX_FONT_BYTES) {
		throw new CustomFontError("This font file is too large");
	}

	const family = fontFamilyFromFileName({ fileName });
	if (!family) {
		throw new CustomFontError("Could not read a font name from this file");
	}

	const sha256 = await sha256Hex({ buffer });
	if (expectedSha256 && sha256 !== expectedSha256.toLowerCase()) {
		// 原生层已经校验过一次，这里是第二道：字节从私有目录交到页面这段也可能坏
		throw new CustomFontError("The font file does not match its checksum");
	}

	const sameFamily = (await listCustomFonts()).find(
		(record) => record.family === family,
	);
	if (SYSTEM_FONTS.has(family)) {
		throw new CustomFontError("This font name is reserved by the system");
	}
	if (sameFamily && sameFamily.sha256 === sha256) {
		throw new CustomFontError("This font is already imported");
	}

	const record: CustomFont = {
		id: generateUUID(),
		family,
		fileName,
		size: buffer.byteLength,
		addedAt: new Date().toISOString(),
		sha256,
	};

	// 同名不同字节 = 同一个 slug 滚了版本：先把旧的删掉再写新的，
	// 不然库里会留两条同族字体，谁生效看注册顺序，那就是玄学了
	if (sameFamily) {
		await deleteCustomFont({ id: sameFamily.id });
	}

	// 先写字节再写索引，注册失败就把两边都退回去：
	// 留下"记录在、文件不在"或"文件在、记录不在"都会变成下次启动的鬼条目
	await fontFiles.set({ key: record.id, value: new File([buffer], fileName) });
	try {
		await fontRecords.set({ key: record.id, value: record });
		await registerFace({ record });
	} catch (error) {
		await fontRecords.remove(record.id).catch(() => undefined);
		await fontFiles.remove(record.id).catch(() => undefined);
		loadedFaces.delete(record.family);
		if (error instanceof CustomFontError) throw error;
		throw new CustomFontError("This font file could not be loaded");
	}

	return record;
}

export async function deleteCustomFont({ id }: { id: string }): Promise<void> {
	const record = await fontRecords.get(id);
	await fontRecords.remove(id);
	await fontFiles.remove(id);
	if (record?.family) {
		const face = loadedFaces.get(record.family);
		if (face) {
			document.fonts.delete(face);
			loadedFaces.delete(record.family);
		}
	}
}

/** 「清除全部数据」要连导入的字体一起清掉，否则库和 OPFS 目录会变成孤儿 */
export async function clearCustomFonts(): Promise<void> {
	await fontRecords.clear().catch(() => undefined);
	await fontFiles.clear().catch(() => undefined);
	for (const [family, face] of loadedFaces) {
		document.fonts.delete(face);
		loadedFaces.delete(family);
	}
}

export function getCustomFontDatabaseName(): string {
	return FONT_DB_NAME;
}
