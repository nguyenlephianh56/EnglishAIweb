import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { createLearningPath, createLearningPathWithAi, getMyLearningPath, setPathItemDone } from "../../api/learningPath";
import { getErrorMessage } from "../../api/client";
import type { LearningPathView } from "../../types/path";

export const PATH_KEY = ["student", "learning-path"] as const;

/** Lộ trình tuần này (GET /learning-path/me); data = null nghĩa là tuần này chưa có lộ trình. */
export const useLearningPath = () => useQuery({ queryKey: PATH_KEY, queryFn: getMyLearningPath, retry: false, staleTime: 60 * 1000 });

export const pathPercent = (progress: LearningPathView["progress"]) => (progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100));

/** Lỗi khi tạo lộ trình, đổi sang lời nhắn dễ hiểu theo mã trạng thái */
export function createPathErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    if (err.code === "ECONNABORTED") return "AI trả lời quá lâu, vui lòng thử lại sau ít phút.";
    if (status === 422) return getErrorMessage(err, "Hiện chưa có bài tập phù hợp để tạo lộ trình.");
    if (status === 429) return "Bạn đã hết lượt dùng AI hôm nay, hãy thử lại vào ngày mai.";
    if (status === 502 || status === 503 || status === 504) return "AI đang bận hoặc trả kết quả chưa hợp lệ, vui lòng thử lại sau ít phút.";
  }
  return getErrorMessage(err, "Không tạo được lộ trình, vui lòng thử lại.");
}

/** Tạo lộ trình thường hoặc bằng AI; thành công thì đặt thẳng vào cache nên trang cập nhật ngay. */
export function useCreatePath() {
  const queryClient = useQueryClient();
  const onSuccess = (path: LearningPathView) => queryClient.setQueryData(PATH_KEY, path);
  const basic = useMutation({ mutationFn: createLearningPath, onSuccess });
  const ai = useMutation({ mutationFn: createLearningPathWithAi, onSuccess });
  return { basic, ai };
}

/** Cập nhật lạc quan một mục (đổi `done` và tính lại tiến độ) */
function withItemDone(path: LearningPathView, itemId: number, done: boolean): LearningPathView {
  const items = path.items.map((i) => (i.id === itemId ? { ...i, done } : i));
  return { ...path, items, progress: { done: items.filter((i) => i.done).length, total: items.length } };
}

/**
 * Bấm ô tròn để đánh dấu hoàn thành / bỏ đánh dấu (PATCH /learning-path/items/:id).
 * Cập nhật ngay trên giao diện, lỗi thì hoàn lại đúng mục đó. `busyIds` là các mục đang gửi (khóa nút để không bấm đúp).
 */
export function useToggleItem(onError: (message: string) => void) {
  const queryClient = useQueryClient();
  const [busyIds, setBusyIds] = useState<ReadonlySet<number>>(new Set());
  const setBusy = (id: number, busy: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });

  const mutation = useMutation({
    mutationFn: ({ itemId, done }: { itemId: number; done: boolean }) => setPathItemDone(itemId, done),
    onMutate: async ({ itemId, done }) => {
      setBusy(itemId, true);
      await queryClient.cancelQueries({ queryKey: PATH_KEY });
      queryClient.setQueryData<LearningPathView | null>(PATH_KEY, (old) => (old ? withItemDone(old, itemId, done) : old));
    },
    onSuccess: (path) => queryClient.setQueryData(PATH_KEY, path),
    onError: (err, { itemId, done }) => {
      queryClient.setQueryData<LearningPathView | null>(PATH_KEY, (old) => (old ? withItemDone(old, itemId, !done) : old));
      onError(axios.isAxiosError(err) && err.response?.status === 404 ? "Mục này không còn trong lộ trình của bạn. Đã tải lại lộ trình." : getErrorMessage(err, "Không cập nhật được mục này, vui lòng thử lại."));
      if (axios.isAxiosError(err) && err.response?.status === 404) void queryClient.invalidateQueries({ queryKey: PATH_KEY });
    },
    onSettled: (_d, _e, { itemId }) => setBusy(itemId, false),
  });

  return { toggle: (itemId: number, done: boolean) => mutation.mutate({ itemId, done }), busyIds };
}
