import { useMemo } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createExercise, deleteExercise, listExercises, proposeExercise } from "../../../api/exercises";
import type { CreateExercisePayload, ExerciseListItem, ExerciseListParams } from "../../../types/exercise";
import type { ExerciseFilters } from "./exerciseMeta";

export const TEACHER_EXERCISES_KEY = ["teacher", "exercises"] as const;

export const EXERCISES_PAGE_SIZE = 10;
const SERVER_MAX = 50;
const MAX_SERVER_PAGES = 10;

type ApiFilters = Pick<ExerciseListParams, "skill" | "level" | "type" | "topic">;

const toApiFilters = (f: ExerciseFilters): ApiFilters => ({ skill: f.skill, level: f.level, type: f.type, topic: f.q.trim() || undefined });

/** Gom mọi trang (50 bài/trang) rồi lọc ở client; dừng sau MAX_SERVER_PAGES trang để không kéo quá nhiều. */
async function loadAll(params: ExerciseListParams, keep: (e: ExerciseListItem) => boolean) {
  const all: ExerciseListItem[] = [];
  let truncated = false;
  for (let page = 1; page <= MAX_SERVER_PAGES; page++) {
    const res = await listExercises({ ...params, page, pageSize: SERVER_MAX });
    all.push(...res.items);
    if (res.items.length === 0 || page * SERVER_MAX >= res.total) break;
    if (page === MAX_SERVER_PAGES) truncated = true;
  }
  return { items: all.filter(keep), truncated };
}

export interface ExerciseListView {
  items: ExerciseListItem[];
  total: number;
  page: number;
  pageCount: number;
  /** Số bài đếm được có chính xác không (false nếu danh sách quá dài bị cắt) */
  exact: boolean;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Danh sách theo tab:
 * - draft: server lọc status=DRAFT, phân trang theo total của server.
 * - mine: TODO xin backend thêm ?mine=true. Tạm thời tải hết (pageSize=50) rồi lọc createdById === userId.
 * - library: server lọc status=PUBLISHED, rồi lọc inLibrary === true ở client (cũng tải hết rồi phân trang tại client).
 */
export function useExerciseList(filters: ExerciseFilters, userId: number | undefined): ExerciseListView {
  const api = toApiFilters(filters);
  const { tab, page } = filters;

  const server = useQuery({
    queryKey: [...TEACHER_EXERCISES_KEY, "draft", api, page] as const,
    queryFn: () => listExercises({ ...api, status: "DRAFT", page, pageSize: EXERCISES_PAGE_SIZE }),
    enabled: tab === "draft",
    placeholderData: keepPreviousData,
  });

  const client = useQuery({
    queryKey: [...TEACHER_EXERCISES_KEY, tab, api, userId] as const,
    queryFn: () =>
      tab === "mine"
        ? loadAll(api, (e) => e.createdById === userId)
        : loadAll({ ...api, status: "PUBLISHED" }, (e) => e.inLibrary === true),
    enabled: tab !== "draft" && (tab !== "mine" || userId !== undefined),
    placeholderData: keepPreviousData,
  });

  return useMemo<ExerciseListView>(() => {
    if (tab === "draft") {
      const total = server.data?.total ?? 0;
      return {
        items: server.data?.items ?? [],
        total,
        page,
        pageCount: Math.max(1, Math.ceil(total / EXERCISES_PAGE_SIZE)),
        exact: true,
        isLoading: server.isLoading,
        isFetching: server.isFetching,
        isError: server.isError,
        refetch: () => void server.refetch(),
      };
    }
    const all = client.data?.items ?? [];
    const pageCount = Math.max(1, Math.ceil(all.length / EXERCISES_PAGE_SIZE));
    const current = Math.min(page, pageCount);
    return {
      items: all.slice((current - 1) * EXERCISES_PAGE_SIZE, current * EXERCISES_PAGE_SIZE),
      total: all.length,
      page: current,
      pageCount,
      exact: client.data ? !client.data.truncated : false,
      isLoading: client.isLoading,
      isFetching: client.isFetching,
      isError: client.isError,
      refetch: () => void client.refetch(),
    };
  }, [tab, page, server.data, server.isLoading, server.isFetching, server.isError, server.refetch, client.data, client.isLoading, client.isFetching, client.isError, client.refetch]);
}

/** Số bài nháp (lấy từ total của server, luôn chính xác). Hai tab còn lại chỉ biết số đếm khi đã tải xong chính tab đó. */
export function useDraftCount(filters: ExerciseFilters) {
  const api = toApiFilters(filters);
  return useQuery({
    queryKey: [...TEACHER_EXERCISES_KEY, "draft-count", api] as const,
    queryFn: () => listExercises({ ...api, status: "DRAFT", page: 1, pageSize: 1 }),
    select: (r) => r.total,
    staleTime: 30 * 1000,
  });
}

/** Ba thao tác trên một bài; thành công thì làm mới mọi danh sách bài tập (và bộ chọn bài ở trang Giao bài). */
export function useExerciseActions() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: TEACHER_EXERCISES_KEY });
  const refreshPicker = () => queryClient.invalidateQueries({ queryKey: ["teacher", "exercise-picker"] });
  const onSuccess = () => {
    void refresh();
    void refreshPicker();
  };

  const propose = useMutation({ mutationFn: (id: number) => proposeExercise(id), onSuccess });
  const remove = useMutation({ mutationFn: (id: number) => deleteExercise(id), onSuccess });
  const duplicate = useMutation({
    mutationFn: (e: ExerciseListItem) => {
      const body: CreateExercisePayload = { type: e.type, skill: e.skill, level: e.level, topic: e.topic, content: e.content };
      // answer/explanation có thể null hoặc vắng: chỉ gửi khi có giá trị để không bị schema của backend từ chối
      if (e.answer != null) body.answer = e.answer;
      if (e.explanation) body.explanation = e.explanation;
      return createExercise(body);
    },
    onSuccess,
  });
  return { propose, remove, duplicate };
}
