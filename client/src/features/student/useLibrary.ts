import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchLibrary } from "./mock/libraryData";
import type { LibraryFilters } from "../../types/library";

export const libraryKey = (filters: LibraryFilters) => ["student", "library", filters] as const;

/**
 * Danh sách bài luyện tập theo bộ lọc: { items, total, isLoading }.
 * Hiện lọc/sắp xếp/phân trang chạy phía client trên dữ liệu giả (mock/libraryData.ts).
 * TODO: nối API thật khi backend có GET danh sách bài.
 */
export function useLibrary(filters: LibraryFilters) {
  const query = useQuery({
    queryKey: libraryKey(filters),
    queryFn: () => fetchLibrary(filters),
    placeholderData: keepPreviousData, // đổi bộ lọc thì giữ danh sách cũ cho tới khi có kết quả mới
    staleTime: 60 * 1000,
  });
  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    page: query.data?.page ?? filters.page,
    pageCount: query.data?.pageCount ?? 1,
    pageSize: query.data?.pageSize ?? 9,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: query.refetch,
  };
}
