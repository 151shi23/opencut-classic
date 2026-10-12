import { useState, useMemo, useCallback, useEffect } from "react";
import {
	getCachedFontAtlas,
	loadFontAtlas,
	clearFontAtlasCache,
} from "@/fonts/google-fonts";
import type { FontAtlas } from "@/fonts/types";
import { SYSTEM_FONTS } from "@/fonts/system-fonts";

type Status = "idle" | "loading" | "error";

export function useFontAtlas({ open }: { open: boolean }) {
	const [atlas, setAtlas] = useState<FontAtlas | null>(() =>
		getCachedFontAtlas(),
	);
	const [status, setStatus] = useState<Status>(() =>
		getCachedFontAtlas() ? "idle" : "loading",
	);

	useEffect(() => {
		if (!open || atlas) return;

		setStatus("loading");
		loadFontAtlas().then((data) => {
			if (data) {
				setAtlas(data);
				setStatus("idle");
			} else {
				setStatus("error");
			}
		});
	}, [open, atlas]);

	const retry = useCallback(() => {
		clearFontAtlasCache();
		setStatus("loading");
		loadFontAtlas().then((data) => {
			if (data) {
				setAtlas(data);
				setStatus("idle");
			} else {
				setStatus("error");
			}
		});
	}, []);

	const fontNames = useMemo(() => {
		/*
		 * 系统字体不依赖 atlas，就不该跟着它一起消失：以前 atlas 为 null 直接返回空数组，
		 * 于是 /fonts/font-atlas.json 拉不到时连 Arial、Noto Sans 这些都不在名单里了。
		 */
		return [
			...new Set([...Object.keys(atlas?.fonts ?? {}), ...SYSTEM_FONTS]),
		].sort();
	}, [atlas]);

	return { atlas, status, fontNames, retry };
}
