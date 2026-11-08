import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMe } from "../api/auth";
import { tokenStorage, UNAUTHORIZED_EVENT } from "../api/client";
import type { AuthUser } from "../types/auth";

export const ME_KEY = ["auth", "me"] as const;

export function useAuth() {
  const queryClient = useQueryClient();
  const hasToken = tokenStorage.get() !== null;

  // Gọi GET /auth/me khi app tải (chỉ khi đang có token)
  const query = useQuery<AuthUser | null>({
    queryKey: ME_KEY,
    queryFn: fetchMe,
    enabled: hasToken,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // Bất kỳ request nào trả 401 -> axios đã xóa token, ở đây xóa luôn người dùng đang lưu
  useEffect(() => {
    const onUnauthorized = () => queryClient.setQueryData(ME_KEY, null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [queryClient]);

  const logout = useCallback(() => {
    tokenStorage.clear();
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
    queryClient.setQueryData(ME_KEY, null);
  }, [queryClient]);

  const user = hasToken ? query.data ?? null : null;

  return { user, isLoading: hasToken && query.isLoading, isAuthenticated: user !== null, logout };
}
