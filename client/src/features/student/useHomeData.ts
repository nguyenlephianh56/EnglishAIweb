import { useQuery } from "@tanstack/react-query";
import { fetchHomeData } from "./mock/homeData";

export const HOME_KEY = ["student", "home"] as const;

/**
 * Dữ liệu trang Trang chủ học sinh: { streak, assignments, skillProfile, recommendation }.
 * Dùng chung cho layout (chuỗi ngày, cấp độ) và trang, nhờ cache của TanStack Query.
 * TODO: đổi fetchHomeData sang API thật (xem mock/homeData.ts).
 */
export function useHomeData() {
  return useQuery({ queryKey: HOME_KEY, queryFn: fetchHomeData, staleTime: 5 * 60 * 1000 });
}
