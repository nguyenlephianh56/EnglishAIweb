import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAiLimits, getPrompt, listAuditLogs, listPrompts, resetPrompt, updateAiLimits, updatePrompt } from "../../api/adminAi";
import type { AiLimitsBody, PromptDetail } from "../../types/adminAi";

export const PROMPTS_KEY = ["admin", "prompts"] as const;
export const AI_LIMITS_KEY = ["admin", "ai-limits"] as const;
export const AUDIT_LOGS_KEY = ["admin", "audit-logs"] as const;
export const AUDIT_PAGE_SIZE = 20;

export const usePromptList = () => useQuery({ queryKey: [...PROMPTS_KEY, "list"] as const, queryFn: listPrompts, staleTime: 30 * 1000 });

export const usePromptDetail = (key: string) => useQuery({ queryKey: [...PROMPTS_KEY, "detail", key] as const, queryFn: () => getPrompt(key), retry: false });

/** Lưu hoặc khôi phục mẫu prompt: kết quả trả về được đặt thẳng vào cache chi tiết, danh sách được tải lại. */
export function usePromptMutations(key: string) {
  const queryClient = useQueryClient();
  const onSuccess = (saved: PromptDetail) => {
    queryClient.setQueryData([...PROMPTS_KEY, "detail", key], saved);
    void queryClient.invalidateQueries({ queryKey: [...PROMPTS_KEY, "list"] });
    void queryClient.invalidateQueries({ queryKey: AUDIT_LOGS_KEY });
  };
  const save = useMutation({ mutationFn: (template: string) => updatePrompt(key, template), onSuccess });
  const reset = useMutation({ mutationFn: () => resetPrompt(key), onSuccess });
  return { save, reset };
}

export const useAiLimits = () => useQuery({ queryKey: AI_LIMITS_KEY, queryFn: getAiLimits, retry: false });

export function useUpdateAiLimits() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AiLimitsBody) => updateAiLimits(body),
    onSuccess: (saved) => {
      queryClient.setQueryData(AI_LIMITS_KEY, saved);
      void queryClient.invalidateQueries({ queryKey: AUDIT_LOGS_KEY });
    },
  });
}

export interface AuditFilters {
  action?: string;
  userId?: number;
  /** ISO 8601 có múi giờ */
  from?: string;
  to?: string;
}

/** Nhật ký thao tác, phân trang theo con trỏ ("Tải thêm"). `enabled` = false khi bộ lọc chưa hợp lệ. */
export function useAuditLogs(filters: AuditFilters, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...AUDIT_LOGS_KEY, filters] as const,
    queryFn: ({ pageParam }) => listAuditLogs({ action: filters.action, user_id: filters.userId, from: filters.from, to: filters.to, limit: AUDIT_PAGE_SIZE, cursor: pageParam }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled,
    staleTime: 30 * 1000,
  });
}
