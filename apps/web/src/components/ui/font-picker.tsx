"use client";

import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
} from "react";
import { List, type RowComponentProps } from "react-window";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loadFullFont } from "@/fonts/google-fonts";
import { SYSTEM_FONTS } from "@/fonts/system-fonts";
import type { FontAtlas, FontAtlasEntry } from "@/fonts/types";
import { useFontAtlas } from "@/fonts/use-font-atlas";
import {
	CustomFontError,
	deleteCustomFont,
	importCustomFont,
	isCustomFontFamily,
	SUPPORTED_FONT_SUFFIXES,
} from "@/fonts/custom-fonts";
import { useCustomFonts } from "@/fonts/use-custom-fonts";
import {
	downloadOnlineFont,
	isOnlineFontStoreAvailable,
	listOnlineFonts,
	type OnlineFont,
} from "@/fonts/online-fonts";
import { cn } from "@/utils/ui";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, TextIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

const FONT_TABS = [
	{ key: "all", label: "All fonts" },
	{ key: "my-fonts", label: "My fonts" },
	// 在线字体要原生层代发（接口是 HMAC 签名的），桌面预览没有这座桥就不给这个页签
	{ key: "online", label: "Online fonts" },
] as const;

type FontTab = (typeof FONT_TABS)[number]["key"];

function formatSize(bytes: number): string {
	if (!bytes || bytes < 0) return "-";
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ROW_HEIGHT = 40;
const PREVIEW_SCALE = 0.8;
const LIST_WIDTH = 288;
const MAX_LIST_HEIGHT = 288;
const OVERSCAN = 15;

interface FontPickerProps {
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	className?: string;
}

export function FontPicker({
	defaultValue,
	onValueChange,
	className,
}: FontPickerProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [activeTab, setActiveTab] = useState<FontTab>("all");
	const [isImporting, setIsImporting] = useState(false);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { atlas, status, fontNames, retry: handleRetry } = useFontAtlas({
		open,
	});
	const { fonts: customFonts, refresh: refreshCustomFonts } = useCustomFonts({
		open,
	});

	// 每次打开弹层重新判断：原生桥是在文档初始化时挂上的，但页面自己的挂载时机
	// 比它晚不了多少，一次性 useMemo 会把它锁死在首屏那一刻的判定上
	const [onlineSupported, setOnlineSupported] = useState(false);
	useEffect(() => {
		if (open) setOnlineSupported(isOnlineFontStoreAvailable());
	}, [open]);
	const visibleTabs = useMemo(
		() => FONT_TABS.filter((tab) => tab.key !== "online" || onlineSupported),
		[onlineSupported],
	);

	const [onlineFonts, setOnlineFonts] = useState<OnlineFont[]>([]);
	const [onlineStatus, setOnlineStatus] = useState<
		"idle" | "loading" | "ready" | "error"
	>("idle");
	const [onlineError, setOnlineError] = useState("");
	const [downloadingSlug, setDownloadingSlug] = useState<string | null>(null);

	const loadOnlineFonts = useCallback(async () => {
		setOnlineStatus("loading");
		setOnlineError("");
		try {
			setOnlineFonts(await listOnlineFonts());
			setOnlineStatus("ready");
		} catch (error) {
			setOnlineError(error instanceof Error ? error.message : String(error));
			setOnlineStatus("error");
		}
	}, []);

	// 只在切到那个页签时拉一次清单：每次打开选择器都去签名请求一遍没意义
	useEffect(() => {
		if (!open || activeTab !== "online") return;
		if (onlineStatus === "loading" || onlineStatus === "ready") return;
		void loadOnlineFonts();
	}, [activeTab, loadOnlineFonts, onlineStatus, open]);

	const importedFileNames = useMemo(
		() => new Set(customFonts.map((font) => font.fileName)),
		[customFonts],
	);

	const handleOnlineDownload = useCallback(
		async (font: OnlineFont) => {
			setDownloadingSlug(font.slug);
			try {
				const file = await downloadOnlineFont({ slug: font.slug });
				await importCustomFont({ file });
				await refreshCustomFonts();
				toast.success("Font downloaded");
			} catch (error) {
				toast.error(
					font.name,
					{
						description:
							error instanceof Error
								? error.message
								: "The font could not be downloaded",
					},
				);
			} finally {
				setDownloadingSlug(null);
			}
		},
		[refreshCustomFonts],
	);

	const customFamilies = useMemo(
		() => new Set(customFonts.map((font) => font.family)),
		[customFonts],
	);

	// 页签以前只是高亮，点「我的字体」和「收藏」拿到的都是全量列表
	const tabFonts = useMemo(() => {
		if (activeTab === "my-fonts") return [...customFamilies];
		return [
			...fontNames,
			...[...customFamilies].filter((family) => !fontNames.includes(family)),
		];
	}, [activeTab, fontNames, customFamilies]);

	const filteredFonts = useMemo(() => {
		if (!search) return tabFonts;
		const query = search.toLowerCase();
		return tabFonts.filter((name) => name.toLowerCase().includes(query));
	}, [tabFonts, search]);

	const listHeight = Math.min(
		MAX_LIST_HEIGHT,
		filteredFonts.length * ROW_HEIGHT,
	);

	const handleSelect = useCallback(
		async ({ family }: { family: string }) => {
			// 本地字体已经在 document.fonts 里了，去问 Google 只会拿到一条废请求
			if (!SYSTEM_FONTS.has(family) && !isCustomFontFamily({ family })) {
				try {
					await loadFullFont({ family });
				} catch {
					// ignore load failure, font will fall back to system default
				}
			}
			onValueChange?.(family);
			setOpen(false);
		},
		[onValueChange],
	);

	const handleImportFiles = useCallback(
		async (files: FileList | null) => {
			if (!files || files.length === 0) return;
			setIsImporting(true);

			let imported = 0;
			for (const file of Array.from(files)) {
				try {
					await importCustomFont({ file });
					imported += 1;
				} catch (error) {
					toast.error(
						file.name,
						error instanceof CustomFontError
							? { description: error.message }
							: { description: "This font file could not be loaded" },
					);
				}
			}

			if (imported > 0) {
				toast.success("Fonts imported");
				await refreshCustomFonts();
			}
			setIsImporting(false);
		},
		[refreshCustomFonts],
	);

	const handleDeleteFont = useCallback(
		async ({ id }: { id: string }) => {
			await deleteCustomFont({ id });
			await refreshCustomFonts();
			toast.success("Font deleted");
		},
		[refreshCustomFonts],
	);

	useEffect(() => {
		if (!open) {
			setSearch("");
			setActiveTab("all");
		}
	}, [open]);

	const activeTabLabel =
		visibleTabs.find((t) => t.key === activeTab)?.label.toLowerCase() ?? "";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				className={cn(
					"border-border bg-accent flex h-7 w-full cursor-pointer items-center justify-between gap-1 rounded-md border px-2.5 text-sm whitespace-nowrap focus-visible:border-primary focus-visible:ring-0 focus:outline-hidden",
					className,
				)}
			>
				<div className="flex min-w-0 items-center gap-1.5">
					<span className="text-muted-foreground [&_svg]:size-3.5 shrink-0">
						<HugeiconsIcon icon={TextIcon} />
					</span>
					<span className="truncate" style={{ fontFamily: defaultValue }}>
						{defaultValue ?? "Select a font"}
					</span>
				</div>
				<ChevronDown className="size-3 shrink-0 opacity-50" />
			</PopoverTrigger>
			<PopoverContent
				// 属性面板在手机横屏下只有一百多 px，弹层按视口收窄，别溢出到屏幕外
				className="w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden p-0"
				align="start"
				side="left"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					searchInputRef.current?.focus();
				}}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					event.stopPropagation();
				}}
			>
				<div className="relative px-3 py-1.5">
					<Search className="absolute top-1/2 left-3 size-3.5 shrink-0 -translate-y-1/2 opacity-50" />
					<Input
						ref={searchInputRef}
						placeholder={`Search ${activeTabLabel}...`}
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						size="xs"
						className="w-full border-none! bg-transparent pl-5 shadow-none!"
					/>
				</div>
				<div className="flex border-b px-3">
					{visibleTabs.map((tab) => (
						<button
							key={tab.key}
							type="button"
							className={cn(
								"-mb-px border-b-2 px-3 py-1.5 text-xs",
								activeTab === tab.key
									? "border-foreground text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground",
							)}
							onClick={() => setActiveTab(tab.key)}
						>
							{tab.label}
						</button>
					))}
				</div>
				{status === "loading" && (
					<div className="py-8 text-center text-sm text-muted-foreground">
						Loading fonts...
					</div>
				)}
				{status === "error" && (
					<div className="flex flex-col items-center gap-3 px-4 py-8">
						<p className="text-center text-sm text-muted-foreground">
							Failed to load font previews.
						</p>
						<Button variant="outline" size="sm" onClick={handleRetry}>
							Retry
						</Button>
					</div>
				)}
				{status === "idle" &&
					activeTab !== "online" &&
					fontNames.length > 0 &&
					filteredFonts.length === 0 && (
						<div className="py-6 text-center text-sm text-muted-foreground">
							{activeTab === "my-fonts"
								? "No fonts imported yet."
								: "No fonts found."}
						</div>
					)}
				{status === "idle" &&
					activeTab !== "online" &&
					atlas &&
					filteredFonts.length > 0 && (
						<List
							rowCount={filteredFonts.length}
							rowHeight={ROW_HEIGHT}
							overscanCount={OVERSCAN}
							rowComponent={FontRow}
							rowProps={{
								atlas,
								filteredFonts,
								selectedFont: defaultValue,
								customFonts,
								customFamilies,
								onFontSelect: handleSelect,
								onFontDelete: handleDeleteFont,
							}}
							style={{ height: listHeight, width: LIST_WIDTH }}
						/>
					)}
				{activeTab === "online" && (
					<div className="scrollbar-hidden max-h-72 overflow-y-auto py-1">
						{/* 资源是陆续上架的（文档说 35 个字体），清单没有刷新入口就等于"第一次打开看到几条就永远是几条"。
						    限流是 30 次/分钟，所以只在点的时候拉，不做自动轮询。 */}
						<div className="flex items-center justify-end gap-2 px-3 pb-1">
							<Button
								variant="ghost"
								size="sm"
								className="h-6 px-2 text-[10px]"
								disabled={onlineStatus === "loading"}
								onClick={() => void loadOnlineFonts()}
							>
								{onlineStatus === "loading" ? (
									<Loader2 className="size-3 animate-spin" />
								) : null}
								Refresh
							</Button>
						</div>
						{onlineStatus === "loading" && (
							<p className="text-muted-foreground px-3 py-6 text-center text-xs">
								Loading fonts...
							</p>
						)}
						{onlineStatus === "error" && (
							<div className="flex flex-col items-center gap-2 px-4 py-6">
								<p className="text-muted-foreground text-center text-xs">
									{onlineError || "The font service is unavailable"}
								</p>
								<Button
									variant="outline"
									size="sm"
									onClick={() => void loadOnlineFonts()}
								>
									Retry
								</Button>
							</div>
						)}
						{onlineStatus === "ready" && onlineFonts.length === 0 && (
							<p className="text-muted-foreground px-3 py-6 text-center text-xs">
								No online fonts.
							</p>
						)}
						{onlineFonts.map((font) => {
							const imported = importedFileNames.has(font.fileName);
							return (
								<div
									key={font.slug}
									className="flex items-center gap-2 px-3 py-1.5"
								>
									<div className="min-w-0 flex-1">
										<p className="truncate text-xs">{font.name}</p>
										<p className="text-muted-foreground truncate text-[10px]">
											{formatSize(font.sizeBytes)} · {font.versionName || "-"} ·{" "}
											{font.fileName}
										</p>
									</div>
									{/* 文档 §6.4：require_feature 非空 = 要先激活对应功能才能下载，
									    服务端阶段二才强校验，现阶段由这边挡；宁可不给入口 */}
									{font.requireFeature ? (
										<span className="text-muted-foreground shrink-0 text-[10px]">
											Activate first
										</span>
									) : imported ? (
										<span className="text-muted-foreground shrink-0 text-[10px]">
											Downloaded
										</span>
									) : (
										<Button
											variant="outline"
											size="sm"
											className="shrink-0"
											disabled={downloadingSlug !== null}
											onClick={() => void handleOnlineDownload(font)}
										>
											{downloadingSlug === font.slug ? (
												<Loader2 className="size-3.5 animate-spin" />
											) : null}
											Download
										</Button>
									)}
								</div>
							);
						})}
					</div>
				)}
				<div className="border-border flex items-center justify-between gap-2 border-t px-3 py-2">
					<Button
						variant="outline"
						size="sm"
						disabled={isImporting}
						onClick={() => fileInputRef.current?.click()}
					>
						{isImporting ? (
							<Loader2 className="size-3.5 animate-spin" />
						) : null}
						Import font
					</Button>
					<span className="text-muted-foreground max-w-[104px] text-right text-[10px] leading-tight">
						{TYPED_ACCEPT_LABEL}
					</span>
					<input
						ref={fileInputRef}
						type="file"
						multiple
						accept={SUPPORTED_FONT_SUFFIXES.join(",")}
						className="hidden"
						onChange={(event) => {
							void handleImportFiles(event.target.files);
							event.target.value = "";
						}}
					/>
				</div>
			</PopoverContent>
		</Popover>
	);
}

const TYPED_ACCEPT_LABEL = "TTF · OTF · WOFF · WOFF2";

function FontSpritePreview({ entry }: { entry: FontAtlasEntry }) {
	return (
		<div
			className="shrink-0"
			style={{
				width: entry.w,
				height: ROW_HEIGHT,
				backgroundColor: "currentColor",
				WebkitMaskImage: `url(/fonts/font-chunk-${entry.ch}.avif)`,
				WebkitMaskPosition: `-${entry.x}px -${entry.y}px`,
				WebkitMaskRepeat: "no-repeat",
				maskImage: `url(/fonts/font-chunk-${entry.ch}.avif)`,
				maskPosition: `-${entry.x}px -${entry.y}px`,
				maskRepeat: "no-repeat",
				transform: `scale(${PREVIEW_SCALE})`,
				transformOrigin: "left center",
			}}
		/>
	);
}

type FontRowProps = {
	atlas: FontAtlas;
	filteredFonts: string[];
	selectedFont: string | undefined;
	customFonts: { id: string; family: string }[];
	customFamilies: Set<string>;
	onFontSelect: (params: { family: string }) => void;
	onFontDelete: (params: { id: string }) => void;
};

function FontRow({
	index,
	style,
	atlas,
	filteredFonts,
	selectedFont,
	customFonts,
	customFamilies,
	onFontSelect,
	onFontDelete,
}: RowComponentProps<FontRowProps>) {
	const fontName = filteredFonts[index];
	const entry = atlas.fonts[fontName];
	const isSelected = fontName === selectedFont;
	const isCustom = customFamilies.has(fontName);
	const isSystemFont = SYSTEM_FONTS.has(fontName);
	const customRecord = isCustom
		? customFonts.find((font) => font.family === fontName)
		: undefined;

	return (
		<div
			style={style as CSSProperties}
			className={cn(
				"flex w-full items-center gap-1 px-3",
				isSelected && "bg-popover-hover",
			)}
		>
			<button
				type="button"
				className="flex min-w-0 flex-1 cursor-pointer items-center outline-hidden hover:bg-popover-hover"
				onClick={() => onFontSelect({ family: fontName })}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						onFontSelect({ family: fontName });
					}
				}}
				aria-label={fontName}
			>
				<div className="min-w-0 overflow-hidden">
					{/* 本地字体没有预烘的 sprite（那是给 Google 字体批量生成的），
						直接用这个字体自己写出名字，反而更能看出效果 */}
					{isSystemFont || isCustom ? (
						<span
							className="text-foreground/85 text-xl"
							style={{ fontFamily: fontName }}
						>
							{fontName}
						</span>
					) : (
						<FontSpritePreview entry={entry} />
					)}
				</div>
			</button>
			{/* 手机上没有 hover，删除按钮必须常驻；放在两个页签里都能找到，
				因为「全部字体」里一样会列出本地字体 */}
			{customRecord ? (
				<Button
					variant="ghost"
					size="icon"
					aria-label={`Delete ${fontName}`}
					className="text-muted-foreground size-7 shrink-0"
					onClick={(event) => {
						event.stopPropagation();
						onFontDelete({ id: customRecord.id });
					}}
				>
					<HugeiconsIcon icon={Delete02Icon} />
				</Button>
			) : null}
		</div>
	);
}
