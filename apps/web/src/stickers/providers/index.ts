import { stickersRegistry } from "../registry";
import type { StickerProvider } from "@/stickers/types";
import { flagsProvider } from "./flags";
import { logosProvider } from "./logos";
import { shapesProvider } from "./shapes";
import { createPackProvider } from "./pack";

/** 六套内置贴纸包，prefix 必须和 public/stickers/<prefix>/ 对得上 */
const PACK_PREFIXES = [
	"twemoji",
	"fluent-emoji-flat",
	"fluent-emoji",
	"noto",
	"solar",
	"thesvg-color",
];

const packProviders: StickerProvider[] = PACK_PREFIXES.map((prefix) =>
	createPackProvider({ prefix }),
);

const defaultProviders: StickerProvider[] = [
	logosProvider,
	flagsProvider,
	shapesProvider,
	...packProviders,
];

export function registerDefaultStickerProviders({
	providersToRegister = defaultProviders,
}: {
	providersToRegister?: StickerProvider[];
} = {}): void {
	for (const provider of providersToRegister) {
		if (stickersRegistry.has(provider.id)) {
			continue;
		}
		stickersRegistry.register({ key: provider.id, definition: provider });
	}
}
