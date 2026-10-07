import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
	browseAll,
	browseCategory,
	CATEGORY_PAGE_SIZE,
	searchAll,
	searchStickers as searchStickersFromProviders,
} from "@/stickers";
import type { StickerBrowseResult, StickerSearchResult } from "@/stickers";
import { STICKER_CATEGORIES } from "@/stickers/categories";
import type { StickerCategory } from "@/stickers/types";
import { registerDefaultStickerProviders } from "@/stickers/providers";
import { stickersRegistry } from "@/stickers/registry";
import { parseStickerId } from "@/stickers/sticker-id";

const MAX_RECENT_STICKERS = 50;
let browseRequestVersion = 0;

function isValidStickerId(value: unknown): value is string {
	if (typeof value !== "string") {
		return false;
	}

	try {
		const parsed = parseStickerId({ stickerId: value });
		return stickersRegistry.has(parsed.providerId);
	} catch {
		return false;
	}
}

function sanitizeRecentStickers({
	recentStickers,
}: {
	recentStickers: unknown;
}): string[] {
	registerDefaultStickerProviders({});

	if (!Array.isArray(recentStickers)) {
		return [];
	}

	const sanitized: string[] = [];
	for (const stickerId of recentStickers) {
		if (!isValidStickerId(stickerId)) {
			continue;
		}
		if (sanitized.includes(stickerId)) {
			continue;
		}
		sanitized.push(stickerId);
		if (sanitized.length >= MAX_RECENT_STICKERS) {
			break;
		}
	}

	return sanitized;
}

type ViewMode = "search" | "browse";

interface StickersStore {
	searchQuery: string;
	selectedCategory: StickerCategory;
	viewMode: ViewMode;
	searchResults: StickerSearchResult | null;
	browseContent: StickerBrowseResult | null;
	recentStickers: string[];
	isSearching: boolean;
	isBrowsing: boolean;
	isLoadingMore: boolean;

	setSearchQuery: ({ query }: { query: string }) => void;
	setSelectedCategory: ({ category }: { category: StickerCategory }) => void;
	searchStickers: ({ query }: { query: string }) => Promise<void>;
	browseStickers: () => Promise<void>;
	loadMoreSection: ({ sectionId }: { sectionId: string }) => Promise<void>;
	addToRecentStickers: ({ stickerId }: { stickerId: string }) => void;
	clearRecentStickers: () => void;
}

export const useStickersStore = create<StickersStore>()(
	persist(
		(set, get) => ({
			searchQuery: "",
			selectedCategory: "all",
			viewMode: "browse",

			searchResults: null,
			browseContent: null,
			recentStickers: [],

			isSearching: false,
			isBrowsing: false,
			isLoadingMore: false,

			setSearchQuery: ({ query }) => set({ searchQuery: query }),

		setSelectedCategory: ({ category }) => {
			set({
				selectedCategory: category in STICKER_CATEGORIES ? category : "all",
				browseContent: null,
			});

			const query = get().searchQuery.trim();
			if (query) {
				void get().searchStickers({ query });
				return;
			}

			void get().browseStickers();
		},

			searchStickers: async ({ query }: { query: string }) => {
				const trimmedQuery = query.trim();
				if (!trimmedQuery) {
					set({ searchResults: null, viewMode: "browse" });
					await get().browseStickers();
					return;
				}

				const category = get().selectedCategory;
				const selectedCategory =
					category in STICKER_CATEGORIES ? category : "all";

				set({ isSearching: true, viewMode: "search" });
				try {
					if (selectedCategory === "all") {
						const browseContent = await searchAll({ query: trimmedQuery });
						set({ browseContent, searchResults: null });
					} else {
						const results = await searchStickersFromProviders({
							query: trimmedQuery,
							category: selectedCategory,
							limit: 100,
						});
						set({ searchResults: results });
					}
				} catch (error) {
					console.error("Search failed:", error);
					set({ searchResults: null });
				} finally {
					set({ isSearching: false });
				}
			},

		browseStickers: async () => {
			const version = ++browseRequestVersion;
			const category = get().selectedCategory;
			const selectedCategory =
				category in STICKER_CATEGORIES ? category : "all";

			set({ isBrowsing: true, viewMode: "browse" });
			try {
				const browseContent =
					selectedCategory === "all"
						? await browseAll({
								recentStickers: get().recentStickers,
							})
						: await browseCategory({
								category: selectedCategory,
							});

				if (version !== browseRequestVersion) return;
				set({ browseContent });
			} catch (error) {
				if (version !== browseRequestVersion) return;
				console.error("Browse failed:", error);
				set({ browseContent: null });
			} finally {
				if (version === browseRequestVersion) {
					set({ isBrowsing: false });
				}
			}
		},

		/*
		 * 分类页签里的「加载更多」。以前那颗按钮写的是「查看全部」，做的事却是
		 * setSelectedCategory(当前分类) —— 值没变，React 不重渲染，所以在「推特表情」
		 * 这类页签里点了没反应（在「全部」里能反应，是因为那里要切的分类和当前不同）。
		 * 一页只有 CATEGORY_PAGE_SIZE 张，剩下的必须靠这里翻出来。
		 */
		loadMoreSection: async ({ sectionId }: { sectionId: string }) => {
			const state = get();
			if (state.isLoadingMore) return;

			const category = state.selectedCategory;
			if (category === "all") return;

			const content = state.browseContent;
			const section = content?.sections.find((s) => s.id === sectionId);
			if (!content || !section || !section.hasMore) return;

			const page = Math.floor(section.items.length / CATEGORY_PAGE_SIZE) + 1;

			set({ isLoadingMore: true });
			try {
				const next = await browseCategory({ category, page });
				const incoming = next.sections.find((s) => s.id === sectionId);
				if (!incoming) return;

				const seen = new Set(section.items.map((item) => item.id));
				const merged = [
					...section.items,
					...incoming.items.filter((item) => !seen.has(item.id)),
				];

				set({
					browseContent: {
						sections: content.sections.map((s) =>
							s.id === sectionId
								? { ...s, items: merged, hasMore: incoming.hasMore }
								: s,
						),
					},
				});
			} catch (error) {
				console.error("Load more stickers failed:", error);
			} finally {
				set({ isLoadingMore: false });
			}
		},

		addToRecentStickers: ({ stickerId }: { stickerId: string }) => {
			const sanitizedStickerIds = sanitizeRecentStickers({
				recentStickers: [stickerId],
			});
			if (sanitizedStickerIds.length === 0) {
				return;
			}

			set((state) => {
				const recent = [
					sanitizedStickerIds[0],
					...state.recentStickers.filter((s) => s !== sanitizedStickerIds[0]),
				];
				return {
					recentStickers: recent.slice(0, MAX_RECENT_STICKERS),
				};
			});

			if (get().viewMode === "browse" && get().selectedCategory === "all") {
				void get().browseStickers();
			}
		},

			clearRecentStickers: () => {
				set({ recentStickers: [] });

				if (get().viewMode === "browse" && get().selectedCategory === "all") {
					void get().browseStickers();
				}
			},
		}),
		{
			name: "stickers-settings",
			version: 1,
			migrate: (persistedState) => {
				if (
					typeof persistedState === "object" &&
					persistedState !== null &&
					"selectedCategory" in persistedState
				) {
					const typedState = persistedState as {
						selectedCategory?: string;
						recentStickers?: string[];
					};
					const category = typedState.selectedCategory ?? "all";
					return {
						...typedState,
						selectedCategory:
							category in STICKER_CATEGORIES
								? (category as StickerCategory)
								: "all",
						recentStickers: sanitizeRecentStickers({
							recentStickers: typedState.recentStickers ?? [],
						}),
					};
				}
				return persistedState;
			},
			partialize: (state) => ({
				selectedCategory: state.selectedCategory,
				recentStickers: state.recentStickers,
			}),
		},
	),
);
