/*
 * 键名必须等于 provider 的 id —— `stickers/index.ts` 的 getProviderByCategory 就是
 * `stickersRegistry.get(category)`，对不上页签会静默搜不出任何东西。
 * 值是英文源串，中文由 src/android/zh-dictionary.ts 注入。
 */
export const STICKER_CATEGORIES = {
	all: "All",
	// v0.4.0
	// logos: "Logos",
	twemoji: "Twemoji",
	"fluent-emoji-flat": "Fluent Flat",
	"fluent-emoji": "Fluent Color",
	noto: "Noto",
	solar: "Solar",
	"thesvg-color": "theSVG",
	flags: "Flags",
	shapes: "Shapes",
};
