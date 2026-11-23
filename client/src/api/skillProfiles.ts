import { api, unwrap } from "./client";
import type { SkillProfileResponse } from "../types/skillProfile";

/** GET /skill-profiles/me: hồ sơ kỹ năng của học sinh đang đăng nhập (không có tham số khoảng thời gian) */
export const getMySkillProfile = () => unwrap<SkillProfileResponse>(api.get("/skill-profiles/me"));

/** GET /skill-profiles/students/:id: hồ sơ của một học sinh (giáo viên/quản trị viên) */
export const getStudentSkillProfile = (studentId: number) => unwrap<SkillProfileResponse>(api.get(`/skill-profiles/students/${studentId}`));
