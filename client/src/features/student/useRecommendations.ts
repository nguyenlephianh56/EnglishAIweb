import { useQuery } from "@tanstack/react-query";
import { getRecommendations } from "../../api/recommendations";

export const RECOMMENDATIONS_KEY = ["student", "recommendations"] as const;

/** Bài gợi ý cho học sinh (GET /recommendations/me); mặc định lấy 1 bài. */
export const useRecommendations = (limit = 1) =>
  useQuery({ queryKey: [...RECOMMENDATIONS_KEY, limit] as const, queryFn: () => getRecommendations(limit), retry: false, staleTime: 60 * 1000 });
