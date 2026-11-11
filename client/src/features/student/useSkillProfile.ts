import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchSkillProfile } from "./mock/profileData";
import type { ProfileRange } from "../../types/profile";

/**
 * Hồ sơ kỹ năng của học sinh theo khoảng thời gian.
 * TODO: nối API thật khi backend có GET hồ sơ kỹ năng (xem mock/profileData.ts).
 */
export function useSkillProfile(range: ProfileRange) {
  return useQuery({
    queryKey: ["student", "skill-profile", range],
    queryFn: () => fetchSkillProfile(range),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });
}
