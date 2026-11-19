import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { listExercises } from "../../api/exercises";
import { questionCount } from "../exercises/contentUtils";
import type { ExerciseSummary, LibraryFilters, LibraryResult } from "../../types/library";

const PAGE_SIZE = 9;

export const libraryKey = (filters: LibraryFilters) => ["student", "library", filters] as const;

/**
 * Danh sách bài luyện tập: GET /exercises (học sinh chỉ nhận bài thư viện đã xuất bản).
 * Ô tìm kiếm và chủ đề cùng gửi qua tham số `topic` (backend tìm gần đúng theo chủ đề).
 */
async function fetchLibrary(f: LibraryFilters): Promise<LibraryResult> {
  const res = await listExercises({
    skill: f.skill,
    level: f.level,
    type: f.type,
    topic: f.topic ?? (f.q.trim() || undefined),
    page: f.page,
    pageSize: PAGE_SIZE,
  });
  const pageSize = res.limit ?? res.pageSize ?? PAGE_SIZE;
  const items: ExerciseSummary[] = res.items.map((e) => ({
    id: e.id,
    topic: e.topic,
    skill: e.skill,
    level: e.level,
    type: String(e.type),
    questionCount: questionCount({ type: String(e.type), content: e.content }),
  }));
  return { items, total: res.total, page: res.page, pageSize, pageCount: Math.max(1, Math.ceil(res.total / pageSize)) };
}

export function useLibrary(filters: LibraryFilters) {
  const query = useQuery({
    queryKey: libraryKey(filters),
    queryFn: () => fetchLibrary(filters),
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  });
  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    page: query.data?.page ?? filters.page,
    pageCount: query.data?.pageCount ?? 1,
    pageSize: query.data?.pageSize ?? PAGE_SIZE,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/** Các chủ đề có trong thư viện (lấy từ tối đa 50 bài mới nhất) cho bộ lọc chủ đề */
export function useLibraryTopics() {
  return useQuery({
    queryKey: ["student", "library", "topics"] as const,
    queryFn: async () => {
      const res = await listExercises({ pageSize: 50 });
      return [...new Set(res.items.map((e) => e.topic.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
    },
    staleTime: 5 * 60 * 1000,
  });
}
