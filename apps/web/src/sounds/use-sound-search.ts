import { useEffect } from "react";
import { isAndroidUI } from "@/android/detect";
import { useSoundsStore } from "@/sounds/sounds-store";
import { searchFreesoundSounds } from "@/sounds/freesound";

export function useSoundSearch({
	query,
	commercialOnly,
	sort,
}: {
	query: string;
	commercialOnly: boolean;
	sort: string;
}) {
	const {
		searchResults,
		isSearching,
		searchError,
		lastSearchQuery,
		currentPage,
		hasNextPage,
		isLoadingMore,
		totalCount,
		setSearchResults,
		setSearching,
		setSearchError,
		setLastSearchQuery,
		setCurrentPage,
		setHasNextPage,
		setTotalCount,
		setLoadingMore,
		appendSearchResults,
		appendTopSounds,
		resetPagination,
	} = useSoundsStore();

	const loadMore = async () => {
		if (isLoadingMore || !hasNextPage) return;

		try {
			setLoadingMore({ loading: true });
			const nextPage = currentPage + 1;
			const data = await searchFreesoundSounds({
				query,
				sort,
				page: nextPage,
				commercialOnly,
			});

			if (query.trim()) {
				appendSearchResults({ results: data.results });
			} else {
				appendTopSounds({ results: data.results });
			}

			setCurrentPage({ page: nextPage });
			setHasNextPage({ hasNext: data.hasNext });
			setTotalCount({ count: data.count });
		} catch (error) {
			setSearchError({
				error: error instanceof Error ? error.message : "Load more failed",
			});
		} finally {
			setLoadingMore({ loading: false });
		}
	};

	const signature = `${sort}|${commercialOnly}|${query.trim()}`;
	const trimmed = query.trim();

	useEffect(() => {
		if (!trimmed) {
			setSearchResults({ results: [] });
			setSearchError({ error: null });
			setLastSearchQuery({ query: "" });
			return;
		}

		// 单字搜索命中很差，还会在输入法逐字提交时白烧 60 次/分钟的配额
		if (trimmed.length < 2) {
			return;
		}

		// 换排序或许可证筛选时签名会变，需要重新搜索而不是命中旧结果
		if (signature === lastSearchQuery && searchResults.length > 0) {
			return;
		}

		let ignore = false;

		// 手机端停顿多、又容易误触发，防抖放宽到 500ms
		const timeoutId = setTimeout(
			async () => {
			try {
				setSearching({ searching: true });
				setSearchError({ error: null });
				resetPagination();

				const data = await searchFreesoundSounds({
					query,
					sort,
					page: 1,
					commercialOnly,
				});

				if (!ignore) {
					setSearchResults({ results: data.results });
					setLastSearchQuery({ query: signature });
					setHasNextPage({ hasNext: data.hasNext });
					setTotalCount({ count: data.count });
					setCurrentPage({ page: 1 });
				}
			} catch (error) {
				if (!ignore) {
					setSearchError({
						error: error instanceof Error ? error.message : "Search failed",
					});
				}
			} finally {
				if (!ignore) {
					setSearching({ searching: false });
				}
			}
			},
			isAndroidUI() ? 500 : 300,
		);

		return () => {
			clearTimeout(timeoutId);
			ignore = true;
		};
	}, [
		query,
		trimmed,
		signature,
		sort,
		commercialOnly,
		lastSearchQuery,
		searchResults.length,
		setSearchResults,
		setSearching,
		setSearchError,
		setLastSearchQuery,
		setCurrentPage,
		setHasNextPage,
		setTotalCount,
		resetPagination,
	]);

	return {
		results: searchResults,
		isLoading: isSearching,
		error: searchError,
		loadMore,
		hasNextPage,
		isLoadingMore,
		totalCount,
	};
}
