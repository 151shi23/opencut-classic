import { create } from "zustand";
import type { SoundEffect, SavedSound } from "@/sounds/types";
import { storageService } from "@/services/storage/service";
import { toast } from "sonner";
import { EditorCore } from "@/core";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { processMediaAssets } from "@/media/processing";
import { AddMediaAssetCommand } from "@/commands/media";
import { InsertElementCommand } from "@/commands/timeline";
import { BatchCommand } from "@/commands";
import { previewExtension } from "@/sounds/freesound";
import { mediaTimeFromSeconds } from "@/wasm";

const MIME_BY_EXTENSION: Record<string, string> = {
	mp3: "audio/mpeg",
	ogg: "audio/ogg",
	opus: "audio/ogg",
	wav: "audio/wav",
	flac: "audio/flac",
	m4a: "audio/mp4",
	aif: "audio/aiff",
	aiff: "audio/aiff",
};

// 落盘回滚是异步的，给它一个观察窗口再向用户汇报成败。
const ADD_SETTLE_CHECK_MS = 700;

function stripExtension({ name }: { name: string }): string {
	return name.replace(/\.(wav|aif|aiff|flac|mp3|ogg|m4a)$/i, "").trim();
}

interface SoundsStore {
	topSoundEffects: SoundEffect[];
	isLoading: boolean;
	error: string | null;
	hasLoaded: boolean;
	showCommercialOnly: boolean;
	soundSort: string;
	setSoundSort: ({ sort }: { sort: string }) => void;
	toggleCommercialFilter: () => void;
	searchQuery: string;
	searchResults: SoundEffect[];
	isSearching: boolean;
	searchError: string | null;
	lastSearchQuery: string;
	scrollPosition: number;
	currentPage: number;
	hasNextPage: boolean;
	totalCount: number;
	isLoadingMore: boolean;
	savedSounds: SavedSound[];
	isSavedSoundsLoaded: boolean;
	isLoadingSavedSounds: boolean;
	savedSoundsError: string | null;

	// 成功返回 null，失败返回原因——手机上没有控制台，原因必须能被看见
	addSoundToTimeline: ({
		sound,
	}: {
		sound: SoundEffect;
	}) => Promise<string | null>;
	setTopSoundEffects: ({ sounds }: { sounds: SoundEffect[] }) => void;
	setLoading: ({ loading }: { loading: boolean }) => void;
	setError: ({ error }: { error: string | null }) => void;
	setHasLoaded: ({ loaded }: { loaded: boolean }) => void;
	setSearchQuery: ({ query }: { query: string }) => void;
	setSearchResults: ({ results }: { results: SoundEffect[] }) => void;
	setSearching: ({ searching }: { searching: boolean }) => void;
	setSearchError: ({ error }: { error: string | null }) => void;
	setLastSearchQuery: ({ query }: { query: string }) => void;
	setScrollPosition: ({ position }: { position: number }) => void;
	setCurrentPage: ({ page }: { page: number }) => void;
	setHasNextPage: ({ hasNext }: { hasNext: boolean }) => void;
	setTotalCount: ({ count }: { count: number }) => void;
	setLoadingMore: ({ loading }: { loading: boolean }) => void;
	appendSearchResults: ({ results }: { results: SoundEffect[] }) => void;
	appendTopSounds: ({ results }: { results: SoundEffect[] }) => void;
	resetPagination: () => void;
	loadSavedSounds: () => Promise<void>;
	saveSoundEffect: ({
		soundEffect,
	}: {
		soundEffect: SoundEffect;
	}) => Promise<void>;
	removeSavedSound: ({ soundId }: { soundId: number }) => Promise<void>;
	isSoundSaved: ({ soundId }: { soundId: number }) => boolean;
	toggleSavedSound: ({
		soundEffect,
	}: {
		soundEffect: SoundEffect;
	}) => Promise<void>;
	clearSavedSounds: () => Promise<void>;
}

export const useSoundsStore = create<SoundsStore>((set, get) => ({
	topSoundEffects: [],
	isLoading: false,
	error: null,
	hasLoaded: false,
	showCommercialOnly: true,
	soundSort: "downloads_desc",

	setSoundSort: ({ sort }) => set({ soundSort: sort }),

	toggleCommercialFilter: () => {
		set((state) => ({ showCommercialOnly: !state.showCommercialOnly }));
	},

	searchQuery: "",
	searchResults: [],
	isSearching: false,
	searchError: null,
	lastSearchQuery: "",
	scrollPosition: 0,
	currentPage: 1,
	hasNextPage: false,
	totalCount: 0,
	isLoadingMore: false,
	savedSounds: [],
	isSavedSoundsLoaded: false,
	isLoadingSavedSounds: false,
	savedSoundsError: null,

	setTopSoundEffects: ({ sounds }) => set({ topSoundEffects: sounds }),
	setLoading: ({ loading }) => set({ isLoading: loading }),
	setError: ({ error }) => set({ error }),
	setHasLoaded: ({ loaded }) => set({ hasLoaded: loaded }),
	setSearchQuery: ({ query }) => set({ searchQuery: query }),
	setSearchResults: ({ results }) =>
		set({ searchResults: results, currentPage: 1 }),
	setSearching: ({ searching }) => set({ isSearching: searching }),
	setSearchError: ({ error }) => set({ searchError: error }),
	setLastSearchQuery: ({ query }) => set({ lastSearchQuery: query }),
	setScrollPosition: ({ position }) => set({ scrollPosition: position }),
	setCurrentPage: ({ page }) => set({ currentPage: page }),
	setHasNextPage: ({ hasNext }) => set({ hasNextPage: hasNext }),
	setTotalCount: ({ count }) => set({ totalCount: count }),
	setLoadingMore: ({ loading }) => set({ isLoadingMore: loading }),

	appendSearchResults: ({ results }) =>
		set((state) => ({
			searchResults: [...state.searchResults, ...results],
		})),

	appendTopSounds: ({ results }) =>
		set((state) => ({
			topSoundEffects: [...state.topSoundEffects, ...results],
		})),

	resetPagination: () =>
		set({
			currentPage: 1,
			hasNextPage: false,
			totalCount: 0,
			isLoadingMore: false,
		}),

	loadSavedSounds: async () => {
		if (get().isSavedSoundsLoaded) return;

		try {
			set({ isLoadingSavedSounds: true, savedSoundsError: null });
			const savedSoundsData = await storageService.loadSavedSounds();
			set({
				savedSounds: savedSoundsData.sounds,
				isSavedSoundsLoaded: true,
				isLoadingSavedSounds: false,
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to load saved sounds";
			set({
				savedSoundsError: errorMessage,
				isLoadingSavedSounds: false,
			});
			console.error("Failed to load saved sounds:", error);
		}
	},

	saveSoundEffect: async ({ soundEffect }) => {
		try {
			await storageService.saveSoundEffect({ soundEffect });

			const savedSoundsData = await storageService.loadSavedSounds();
			set({ savedSounds: savedSoundsData.sounds });
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to save sound";
			set({ savedSoundsError: errorMessage });
			toast.error("Failed to save sound");
			console.error("Failed to save sound:", error);
		}
	},

	removeSavedSound: async ({ soundId }) => {
		try {
			await storageService.removeSavedSound({ soundId });

			set((state) => ({
				savedSounds: state.savedSounds.filter((sound) => sound.id !== soundId),
			}));
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to remove sound";
			set({ savedSoundsError: errorMessage });
			toast.error("Failed to remove sound");
			console.error("Failed to remove sound:", error);
		}
	},

	isSoundSaved: ({ soundId }) => {
		const { savedSounds } = get();
		return savedSounds.some((sound) => sound.id === soundId);
	},

	toggleSavedSound: async ({ soundEffect }) => {
		const { isSoundSaved, saveSoundEffect, removeSavedSound } = get();

		if (isSoundSaved({ soundId: soundEffect.id })) {
			await removeSavedSound({ soundId: soundEffect.id });
		} else {
			await saveSoundEffect({ soundEffect });
		}
	},

	clearSavedSounds: async () => {
		try {
			await storageService.clearSavedSounds();
			set({
				savedSounds: [],
				savedSoundsError: null,
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to clear saved sounds";
			set({ savedSoundsError: errorMessage });
			toast.error("Failed to clear saved sounds");
			console.error("Failed to clear saved sounds:", error);
		}
	},

	// 走素材库那条路：预览下载下来变成真正的 File，存进 OPFS + IndexedDB，
	// 断网或者重开工程还能播（library 元素每次播放都要重新联网取 sourceUrl）。
	addSoundToTimeline: async ({ sound }) => {
		const audioUrl = sound.previewUrl;
		if (!audioUrl) {
			toast.error("Sound file not available");
			return "no preview url";
		}

		const editor = EditorCore.getInstance();
		const project = editor.project.getActiveOrNull();
		if (!project) {
			toast.error("No active project");
			return "no active project";
		}

		try {
			const response = await fetch(audioUrl, {
				mode: "cors",
				credentials: "omit",
			});
			if (!response.ok) {
				throw new Error(`Could not download this sound (${response.status})`);
			}

			const arrayBuffer = await response.arrayBuffer();
			if (arrayBuffer.byteLength === 0) {
				throw new Error("This sound came back empty");
			}

			const extension = previewExtension({ url: audioUrl });
			const baseName = stripExtension({ name: sound.name }) || "sound";
			const file = new File([arrayBuffer], `${baseName}.${extension}`, {
				type: MIME_BY_EXTENSION[extension] ?? "audio/mpeg",
			});

			const [asset] = await processMediaAssets({ files: [file] });
			if (!asset) {
				throw new Error("Could not add this sound to the project");
			}

			// 时长只认有限正数：探针拿不到就退到接口给的 duration，再退到 1 秒，
			// 否则零宽片段加进去也看不见，等于没加。
			const seconds =
				[asset.duration, sound.duration].find(
					(value): value is number =>
						typeof value === "number" && Number.isFinite(value) && value > 0,
				) ?? 1;

			const startTime = editor.playback.getCurrentTime();
			const duration = mediaTimeFromSeconds({ seconds });

			const addMediaCommand = new AddMediaAssetCommand({
				projectId: project.metadata.id,
				asset,
			});
			// 不往元素上挂 AudioBuffer：它不是可结构化克隆的对象，进工程状态会
			// 把 IndexedDB 落盘整个打挂，落盘失败时 AddMediaAssetCommand 会把孤儿
			// 片段删掉——现象就是点「+」像什么都没发生。普通导入素材也不传它。
			const element = buildElementFromMedia({
				mediaId: addMediaCommand.getAssetId(),
				mediaType: "audio",
				name: baseName,
				duration,
				startTime,
			});

			const insertCommand = new InsertElementCommand({
				element,
				placement: { mode: "auto", trackType: "audio" },
			});

			editor.command.execute({
				command: new BatchCommand([addMediaCommand, insertCommand]),
			});

			const findElement = () => {
				const scene = editor.scenes.getActiveSceneOrNull();
				if (!scene) {
					return null;
				}
				const tracks = [
					scene.tracks.main,
					...scene.tracks.overlay,
					...scene.tracks.audio,
				];
				const elementId = insertCommand.getElementId();
				for (const track of tracks) {
					for (const item of track.elements) {
						if (item.id === elementId) {
							return item;
						}
					}
				}
				return null;
			};

			// InsertElementCommand 校验失败时只 console.error，手机上看不见控制台，
			// 现象就是「点了没反应」。这里先当场确认片段真的落进了轨道。
			if (!findElement()) {
				return "时间轴放不下这个片段（轨道冲突）";
			}

			// 落盘失败是异步回滚的：片段先出现、几百毫秒后再被删掉。所以等它落定
			// 再汇报成功，别把喊早的成功当成没加进去。
			const stillThere = await new Promise<boolean>((resolve) => {
				setTimeout(() => resolve(findElement() !== null), ADD_SETTLE_CHECK_MS);
			});
			if (!stillThere) {
				return "加入后被工程撤销了（写入本地存储失败，通常是空间不足）";
			}
			return null;
		} catch (error) {
			console.error("Failed to add sound to timeline:", error);
			const reason =
				error instanceof Error ? error.message : "Failed to add sound to timeline";
			toast.error(reason, { id: `sound-${sound.id}` });
			return reason;
		}
	},
}));
