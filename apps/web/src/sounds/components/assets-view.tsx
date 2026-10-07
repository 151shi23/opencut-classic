"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import {
	FREESOUND_SORTS,
	PAGE_SIZE,
	isFreesoundConfigured,
	searchFreesoundSounds,
} from "@/sounds/freesound";
import { useSoundSearch } from "@/sounds/use-sound-search";
import { useSoundsStore } from "@/sounds/sounds-store";
import { isAndroidUI } from "@/android/detect";
import type { SavedSound, SoundEffect } from "@/sounds/types";
import { cn } from "@/utils/ui";
import {
	FavouriteIcon,
	FilterMailIcon,
	PauseIcon,
	PlayIcon,
	PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export function SoundsView() {
	const compact = isAndroidUI();
	return (
		<div className="flex h-full flex-col">
			<Tabs defaultValue="sound-effects" className="flex h-full flex-col">
				<div className={cn("px-3 pt-4 pb-0", compact && "px-2 pt-2")}>
					<TabsList className={cn(compact && "w-full")}>
						<TabsTrigger
							value="sound-effects"
							className={cn(compact && "h-7 flex-1 px-2 text-xs")}
						>
							Sound effects
						</TabsTrigger>
						<TabsTrigger
							value="saved"
							className={cn(compact && "h-7 flex-1 px-2 text-xs")}
						>
							Saved
						</TabsTrigger>
					</TabsList>
				</div>
				<Separator className={cn(compact ? "my-1.5" : "my-4")} />
				<TabsContent
					value="sound-effects"
					className={cn(
						"mt-0 flex min-h-0 flex-1 flex-col p-5 pt-0",
						compact && "px-2 pb-1",
					)}
				>
					<SoundEffectsView compact={compact} />
				</TabsContent>
				<TabsContent
					value="saved"
					className={cn(
						"mt-0 flex min-h-0 flex-1 flex-col p-5 pt-0",
						compact && "px-2 pb-1",
					)}
				>
					<SavedSoundsView compact={compact} />
				</TabsContent>
			</Tabs>
		</div>
	);
}

function SoundEffectsView({ compact }: { compact: boolean }) {
	const {
		topSoundEffects,
		isLoading,
		error,
		searchQuery,
		setSearchQuery,
		scrollPosition,
		setScrollPosition,
		loadSavedSounds,
		showCommercialOnly,
		toggleCommercialFilter,
		soundSort,
		setSoundSort,
		setTopSoundEffects,
		setLoading,
		setError,
		setCurrentPage,
		setHasNextPage,
		setTotalCount,
	} = useSoundsStore();
	const {
		results: searchResults,
		isLoading: isSearching,
		loadMore,
		hasNextPage,
		isLoadingMore,
	} = useSoundSearch({
		query: searchQuery,
		commercialOnly: showCommercialOnly,
		sort: soundSort,
	});

	const [playingId, setPlayingId] = useState<number | null>(null);
	const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
		null,
	);

	// 中文输入法在合成阶段每敲一个拼音都会触发一次 change，直接写进 store 会把请求配额打爆，
	// 所以输入先落在本地 draft，合成结束（或按回车）才提交给搜索。
	const [draft, setDraft] = useState(searchQuery);
	const composing = useRef(false);

	const commitQuery = ({ value }: { value: string }) => {
		setDraft(value);
		if (composing.current) return;
		setSearchQuery({ query: value });
	};

	const { scrollAreaRef, handleScroll } = useInfiniteScroll({
		onLoadMore: loadMore,
		hasMore: hasNextPage,
		isLoading: isLoadingMore || isSearching,
	});

	// 排序或许可证筛选变了就重新取一次，切标签页回来不重复请求
	const loadSignature = `${soundSort}|${showCommercialOnly}`;
	const loadedSignature = useRef<string | null>(null);

	useEffect(() => {
		loadSavedSounds();
	}, [loadSavedSounds]);

	useEffect(() => {
		if (loadedSignature.current === loadSignature) {
			return;
		}

		let shouldIgnore = false;

		const fetchTopSounds = async () => {
			try {
				if (!shouldIgnore) {
					setLoading({ loading: true });
					setError({ error: null });
				}

				const data = await searchFreesoundSounds({
					query: "",
					sort: soundSort,
					page: 1,
					pageSize: PAGE_SIZE,
					commercialOnly: showCommercialOnly,
				});

				if (!shouldIgnore) {
					loadedSignature.current = loadSignature;
					setTopSoundEffects({ sounds: data.results });
					setCurrentPage({ page: 1 });
					setHasNextPage({ hasNext: data.hasNext });
					setTotalCount({ count: data.count });
				}
			} catch (caught) {
				if (!shouldIgnore) {
					console.error("Failed to fetch top sounds:", caught);
					setError({
						error:
							caught instanceof Error
								? caught.message
								: "Failed to load sounds",
					});
				}
			} finally {
				if (!shouldIgnore) {
					setLoading({ loading: false });
				}
			}
		};

		const timeoutId = setTimeout(fetchTopSounds, 100, {});

		return () => {
			shouldIgnore = true;
			clearTimeout(timeoutId);
		};
	}, [
		loadSignature,
		soundSort,
		showCommercialOnly,
		setTopSoundEffects,
		setLoading,
		setError,
		setCurrentPage,
		setHasNextPage,
		setTotalCount,
	]);

	useEffect(() => {
		if (!scrollAreaRef.current || scrollPosition <= 0) {
			return;
		}

		const restoreScrollPosition = () => {
			scrollAreaRef.current?.scrollTo({ top: scrollPosition });
		};

		const timeoutId = setTimeout(restoreScrollPosition, 100, {});

		return () => clearTimeout(timeoutId);
	}, [scrollPosition, scrollAreaRef]);

	const handleScrollWithPosition = ({
		currentTarget,
	}: React.UIEvent<HTMLDivElement>) => {
		const { scrollTop } = currentTarget;
		setScrollPosition({ position: scrollTop });
		handleScroll({ currentTarget } as React.UIEvent<HTMLDivElement>);
	};

	const displayedSounds = searchQuery ? searchResults : topSoundEffects;
	const visibleSorts = FREESOUND_SORTS.filter(
		(option) => !option.needsQuery || searchQuery.trim().length > 0,
	);

	const playSound = ({ sound }: { sound: SoundEffect }) => {
		if (playingId === sound.id) {
			audioElement?.pause();
			setPlayingId(null);
			return;
		}

		audioElement?.pause();

		if (sound.previewUrl) {
			const audio = new Audio(sound.previewUrl);
			audio.addEventListener("ended", () => {
				setPlayingId(null);
			});
			audio.addEventListener("error", () => {
				setPlayingId(null);
			});
			audio.play().catch((error) => {
				console.error("Failed to play sound preview:", error);
				setPlayingId(null);
			});

			setAudioElement(audio);
			setPlayingId(sound.id);
		}
	};

	return (
		<div
			className={cn(
				"mt-1 flex h-full min-h-0 flex-col gap-4",
				compact && "gap-2",
			)}
		>
			<div className={cn("flex items-center gap-3", compact && "gap-2")}>
				<Input
					placeholder="Search sound effects"
					className="w-full"
					containerClassName={cn("w-full", compact && "flex-1 min-w-0")}
					size={compact ? "sm" : "default"}
					value={draft}
					onChange={({ currentTarget }) =>
						commitQuery({ value: currentTarget.value })
					}
					onCompositionStart={() => {
						composing.current = true;
					}}
					onCompositionEnd={({ currentTarget }) => {
						composing.current = false;
						commitQuery({ value: currentTarget.value });
					}}
					onKeyDown={({ key }) => {
						if (key === "Enter") setSearchQuery({ query: draft.trim() });
					}}
					showClearIcon
					onClear={() => {
						setDraft("");
						setSearchQuery({ query: "" });
					}}
				/>
				{!compact && (
					<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="text"
							size="icon"
							className={cn(showCommercialOnly && "text-primary")}
						>
							<HugeiconsIcon icon={FilterMailIcon} />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
						<DropdownMenuCheckboxItem
							checked={showCommercialOnly}
							onCheckedChange={() => toggleCommercialFilter()}
						>
							Show only commercially licensed
						</DropdownMenuCheckboxItem>
						<div className="text-muted-foreground px-2 py-1.5 text-xs">
							{showCommercialOnly
								? "Only showing sounds licensed for commercial use"
								: "Showing all sounds regardless of license"}
						</div>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>

			<div
				className={cn(
					"scrollbar-none flex shrink-0 items-center gap-1.5 overflow-x-auto",
					compact && "gap-1",
				)}
			>
				{visibleSorts.map((option) => {
					const isActive = option.value === soundSort;
					return (
						<Button
							key={option.value}
							variant="text"
							size="sm"
							className={cn(
								"h-7 shrink-0 rounded-full px-2.5 text-xs",
								compact && "h-8 text-[11px]",
								isActive && "bg-primary/15 text-primary",
							)}
							onClick={() => setSoundSort({ sort: option.value })}
						>
							{option.label}
						</Button>
					);
				})}
				{/* 手机版把「只看可商用」从三级下拉里提出来，一颗胶囊一次点到位 */}
				{compact && (
					<Button
						variant="text"
						size="sm"
						className={cn(
							"h-8 shrink-0 rounded-full border border-border px-2.5 text-[11px]",
							showCommercialOnly
								? "bg-primary/15 text-primary"
								: "text-muted-foreground",
						)}
						onClick={() => toggleCommercialFilter()}
					>
						Commercial only
					</Button>
				)}
			</div>

			{!isFreesoundConfigured() && (
				<div className="text-muted-foreground rounded-md bg-muted/40 p-3 text-xs leading-relaxed">
					<p>Sound effects need a Freesound API key</p>
					<p>Apply at freesound.org/apiv2/apply</p>
					<p>Then set NEXT_PUBLIC_FREESOUND_API_KEY</p>
				</div>
			)}

			{error && (
				<div className="text-destructive shrink-0 text-xs">{error}</div>
			)}

			<div className="relative min-h-0 flex-1 overflow-hidden">
				<ScrollArea
					className="h-full flex-1"
					ref={scrollAreaRef}
					onScrollCapture={handleScrollWithPosition}
				>
					<div
						className={cn(
							"flex flex-col gap-4 pb-2",
							compact && "gap-1.5",
						)}
					>
						{isLoading && !searchQuery && !compact && (
							<div className="text-muted-foreground text-sm">
								Loading sounds...
							</div>
						)}
						{isLoading && !searchQuery && compact && (
							<>
								{Array.from({ length: 5 }).map((_, index) => (
									<div
										key={index}
										className="bg-muted/40 h-14 animate-pulse rounded-md"
									/>
								))}
							</>
						)}
						{isSearching && searchQuery && (
							<div className="text-muted-foreground text-sm">Searching...</div>
						)}
						{displayedSounds.map((sound) => (
							<AudioItem
								key={sound.id}
								sound={sound}
								compact={compact}
								isPlaying={playingId === sound.id}
								onPlay={playSound}
							/>
						))}
						{!isLoading && !isSearching && displayedSounds.length === 0 && (
							<div className="text-muted-foreground text-sm">
								{searchQuery ? "No sounds found" : "No sounds available"}
							</div>
						)}
						{isLoadingMore && (
							<div className="text-muted-foreground py-4 text-center text-sm">
								Loading more sounds...
							</div>
						)}
					</div>
				</ScrollArea>
			</div>
		</div>
	);
}

function SavedSoundsView({ compact }: { compact: boolean }) {
	const {
		savedSounds,
		isLoadingSavedSounds,
		savedSoundsError,
		loadSavedSounds,
		clearSavedSounds,
	} = useSoundsStore();

	const [playingId, setPlayingId] = useState<number | null>(null);
	const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
		null,
	);

	const [showClearDialog, setShowClearDialog] = useState(false);

	useEffect(() => {
		loadSavedSounds();
	}, [loadSavedSounds]);

	const playSound = ({ sound }: { sound: SoundEffect }) => {
		if (playingId === sound.id) {
			audioElement?.pause();
			setPlayingId(null);
			return;
		}

		audioElement?.pause();

		if (sound.previewUrl) {
			const audio = new Audio(sound.previewUrl);
			audio.addEventListener("ended", () => {
				setPlayingId(null);
			});
			audio.addEventListener("error", () => {
				setPlayingId(null);
			});
			audio.play().catch((error) => {
				console.error("Failed to play sound preview:", error);
				setPlayingId(null);
			});

			setAudioElement(audio);
			setPlayingId(sound.id);
		}
	};

	const convertToSoundEffect = ({
		savedSound,
	}: {
		savedSound: SavedSound;
	}): SoundEffect => ({
		id: savedSound.id,
		name: savedSound.name,
		description: "",
		url: "",
		previewUrl: savedSound.previewUrl,
		downloadUrl: savedSound.downloadUrl,
		duration: savedSound.duration,
		filesize: 0,
		type: "audio",
		channels: 0,
		bitrate: 0,
		bitdepth: 0,
		samplerate: 0,
		username: savedSound.username,
		tags: savedSound.tags,
		license: savedSound.license,
		created: savedSound.savedAt,
		downloads: 0,
		rating: 0,
		ratingCount: 0,
	});

	if (isLoadingSavedSounds) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-muted-foreground text-sm">
					Loading saved sounds...
				</div>
			</div>
		);
	}

	if (savedSoundsError) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-destructive text-sm">
					Error: {savedSoundsError}
				</div>
			</div>
		);
	}

	if (savedSounds.length === 0) {
		return (
			<div className="bg-background flex h-full flex-col items-center justify-center gap-3 p-4">
				<HugeiconsIcon
					icon={FavouriteIcon}
					className="text-muted-foreground size-10"
				/>
				<div className="flex flex-col gap-2 text-center">
					<p className="text-lg font-medium">No saved sounds</p>
					<p className="text-muted-foreground text-sm text-balance">
						Click the heart icon on any sound to save it here
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="mt-1 flex h-full flex-col gap-5">
			<div className="flex items-center justify-between">
				<p className="text-muted-foreground text-sm">
					{savedSounds.length} saved{" "}
					{savedSounds.length === 1 ? "sound" : "sounds"}
				</p>
				<Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
					<DialogTrigger asChild>
						<Button
							variant="text"
							size="sm"
							className="text-muted-foreground hover:text-destructive h-auto !opacity-100"
						>
							Clear all
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Clear all saved sounds?</DialogTitle>
							<DialogDescription>
								This will permanently remove all {savedSounds.length} saved
								sounds from your collection. This action cannot be undone.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button variant="text" onClick={() => setShowClearDialog(false)}>
								Cancel
							</Button>
							<Button
								variant="destructive"
								onClick={async (
									event: React.MouseEvent<HTMLButtonElement>,
								) => {
									event.stopPropagation();
									await clearSavedSounds();
									setShowClearDialog(false);
								}}
							>
								Clear all sounds
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>

			<div className="relative min-h-0 flex-1 overflow-hidden">
				<ScrollArea className="h-full flex-1">
					<div className={cn("flex flex-col gap-4 pb-2", compact && "gap-1.5")}>
						{savedSounds.map((sound) => (
							<AudioItem
								key={sound.id}
								sound={convertToSoundEffect({ savedSound: sound })}
								compact={compact}
								isPlaying={playingId === sound.id}
								onPlay={playSound}
							/>
						))}
					</div>
				</ScrollArea>
			</div>
		</div>
	);
}

interface AudioItemProps {
	sound: SoundEffect;
	compact?: boolean;
	isPlaying: boolean;
	onPlay: ({ sound }: { sound: SoundEffect }) => void;
}

function AudioItem({ sound, compact, isPlaying, onPlay }: AudioItemProps) {
	const { addSoundToTimeline, isSoundSaved, toggleSavedSound } =
		useSoundsStore();
	const [status, setStatus] = useState<"idle" | "adding" | "failed" | "added">(
		"idle",
	);
	const [addReason, setAddReason] = useState<string | null>(null);
	const isAdding = status === "adding";
	const isSaved = isSoundSaved({ soundId: sound.id });

	const handleClick = () => {
		onPlay({ sound });
	};

	const handleSaveClick = (event: React.MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		toggleSavedSound({ soundEffect: sound });
	};

	const handleAddToTimeline = async (
		event: React.MouseEvent<HTMLButtonElement>,
	) => {
		event.stopPropagation();
		setStatus("adding");
		setAddReason(null);
		let reason: string | null = null;
		try {
			reason = await addSoundToTimeline({ sound });
		} catch (error) {
			reason = error instanceof Error ? error.message : String(error);
		} finally {
			setStatus(reason ? "failed" : "added");
			setAddReason(reason);
			// 失败的原因要留在屏幕上够久，用户能截图发回来；成功两秒就收回
			setTimeout(() => setStatus("idle"), reason ? 15000 : 2000);
		}
	};

	// 手机版：面板只有 ~150px 宽。原来整张卡都是"点击即试听"，加号是那枚 32px 的图标按钮
	// 嵌在卡里——手指落在卡上就算试听，加号很容易被吞掉（用户实测点了没反应）。
	// 现在卡片本身不再响应点击，试听和加入是两枚并排的整宽按钮，谁也不挡谁。
	if (compact) {
		return (
			<div
				className={cn(
					"flex flex-col gap-1 rounded-md border px-2 py-1.5",
					isPlaying
						? "border-primary/60 bg-primary/10"
						: "border-border/50 bg-muted/30",
				)}
			>
				<p className="truncate text-xs font-medium">{sound.name}</p>
				<div className="flex items-center justify-between gap-2">
					<span className="text-muted-foreground min-w-0 truncate text-[10px]">
						{sound.duration > 0 && `${sound.duration.toFixed(1)}s`}
						{sound.license && ` · ${sound.license}`}
						{isPlaying && " · 试听中"}
					</span>
					<button
						type="button"
						aria-label={isSaved ? "Remove from saved" : "Save sound"}
						onClick={handleSaveClick}
						className={cn(
							"flex size-8 shrink-0 items-center justify-center rounded-md border border-border/50 active:opacity-55",
							isSaved ? "text-red-500" : "text-muted-foreground",
						)}
					>
						<HugeiconsIcon
							icon={FavouriteIcon}
							className={cn("size-4", isSaved && "fill-current")}
						/>
					</button>
				</div>
				<div className="flex items-center gap-1.5">
					<button
						type="button"
						onClick={handleClick}
						className={cn(
							"flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-border/50 text-[11px] active:opacity-55",
							isPlaying ? "text-primary border-primary/60" : "",
						)}
					>
						<HugeiconsIcon
							icon={isPlaying ? PauseIcon : PlayIcon}
							className="size-3.5"
						/>
						{isPlaying ? "停止" : "试听"}
					</button>
					<button
						type="button"
						disabled={isAdding}
						onClick={handleAddToTimeline}
						className={cn(
							"bg-primary text-primary-foreground flex h-8 flex-1 items-center justify-center gap-1 rounded-md text-[11px] active:opacity-55",
							isAdding && "opacity-40",
							status === "failed" && "bg-destructive",
							status === "added" && "bg-emerald-600",
						)}
					>
						<HugeiconsIcon icon={PlusSignIcon} className="size-3.5" />
						加入工程
					</button>
				</div>
				{status !== "idle" && (
					<p
						className={cn(
							"w-full break-words text-[10px] leading-tight",
							status === "failed" ? "text-destructive" : "text-muted-foreground",
						)}
					>
						{status === "adding" && "加入中…（下载 → 存入工程）"}
						{status === "added" && "已加入时间轴，划到轨道区就能看到"}
						{status === "failed" && `加入失败：${addReason ?? "未知原因"}`}
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="group flex items-center gap-3 opacity-100 hover:opacity-75">
			<button
				type="button"
				className="flex min-w-0 flex-1 items-center gap-3 text-left"
				onClick={handleClick}
			>
				<div className="bg-accent relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md">
					<div className="from-primary/20 absolute inset-0 bg-gradient-to-br to-transparent" />
					{isPlaying ? (
						<HugeiconsIcon icon={PauseIcon} className="size-5" />
					) : (
						<HugeiconsIcon icon={PlayIcon} className="size-5" />
					)}
				</div>

				<div className="min-w-0 flex-1 overflow-hidden">
					<p className="truncate text-sm font-medium">{sound.name}</p>
					<span className="text-muted-foreground block truncate text-xs">
						{sound.username}
						{sound.duration > 0 && ` · ${sound.duration.toFixed(1)}s`}
						{sound.license && ` · ${sound.license}`}
					</span>
				</div>
			</button>

			<div className="flex items-center gap-3 pr-2">
				<Button
					variant="text"
					size="icon"
					className={cn(
						"text-muted-foreground hover:text-foreground w-auto !opacity-100",
						isAdding && "opacity-40",
					)}
					onClick={handleAddToTimeline}
					disabled={isAdding}
					title="Add to timeline"
				>
					<HugeiconsIcon icon={PlusSignIcon} />
				</Button>
				<Button
					variant="text"
					size="icon"
					className={`hover:text-foreground w-auto !opacity-100 ${
						isSaved
							? "text-red-500 hover:text-red-600"
							: "text-muted-foreground"
					}`}
					onClick={handleSaveClick}
					title={isSaved ? "Remove from saved" : "Save sound"}
				>
					<HugeiconsIcon
						icon={FavouriteIcon}
						className={`${isSaved ? "fill-current" : ""}`}
					/>
				</Button>
			</div>
		</div>
	);
}
