import { useCallback, useEffect, useState } from "react";
import {
	listCustomFonts,
	registerAllCustomFonts,
	type CustomFont,
} from "@/fonts/custom-fonts";

let registration: Promise<CustomFont[]> | null = null;

/**
 * 只注册一次。`registerAllCustomFonts` 会把每个字体文件从 OPFS 整份读进内存，
 * 中文字体一份就是十几 MB，绝不能每次打开选择器都跑一遍。
 */
export function ensureCustomFontsRegistered(): Promise<CustomFont[]> {
	if (!registration) {
		registration = registerAllCustomFonts();
	}
	return registration;
}

export function useCustomFonts({ open }: { open: boolean }) {
	const [fonts, setFonts] = useState<CustomFont[]>([]);
	const [isLoaded, setIsLoaded] = useState(false);

	const refresh = useCallback(async () => {
		await ensureCustomFontsRegistered();
		setFonts(await listCustomFonts());
		setIsLoaded(true);
	}, []);

	useEffect(() => {
		if (!open || isLoaded) return;
		void refresh();
	}, [open, isLoaded, refresh]);

	return { fonts, refresh };
}
