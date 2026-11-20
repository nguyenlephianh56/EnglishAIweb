import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMySkillProfile } from "../../api/skillProfiles";
import { mapSkillProfile } from "./mapSkillProfile";
import type { ProfileRange } from "../../types/profile";

export const SKILL_PROFILE_KEY = ["student", "skill-profile", "me"] as const;

/**
 * Hồ sơ kỹ năng của học sinh (GET /skill-profiles/me), tải MỘT lần rồi lọc khoảng 7/30/90 ngày ở client:
 * đổi `range` chỉ tính lại dữ liệu hiển thị (select), không gọi lại API.
 */
export function useSkillProfile(range: ProfileRange) {
  const select = useCallback((raw: Parameters<typeof mapSkillProfile>[0]) => mapSkillProfile(raw, range), [range]);
  return useQuery({
    queryKey: SKILL_PROFILE_KEY,
    queryFn: getMySkillProfile,
    select,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
