import type { CefrLevel, SkillAxis, SkillKey } from "./student";

export type ProfileRange = "7d" | "30d" | "90d";

export interface SkillScore {
  skill: SkillKey;
  /** 0-100 */
  score: number;
  /** Thay đổi điểm trong khoảng thời gian đang chọn (âm = giảm) */
  delta: number;
}

/** Một mốc thời gian của biểu đồ tiến bộ: điểm 4 kỹ năng */
export type ProgressPoint = { label: string } & Record<SkillKey, number>;

export interface ErrorType {
  id: string;
  label: string;
  percent: number;
}

export interface Weakness {
  id: number;
  skill: SkillKey;
  title: string;
  description: string;
  actionLabel: string;
}

export interface SkillProfileData {
  /** false khi học sinh chưa làm bài nào */
  hasData: boolean;
  level: CefrLevel;
  levelLabel: string;
  /** Tổng điểm tăng/giảm trong khoảng thời gian */
  deltaPoints: number;
  /** 5 trục của biểu đồ radar (Nền tảng, Nghe, Nói, Viết, Đọc) */
  radar: SkillAxis[];
  xp: { current: number; target: number };
  skills: SkillScore[];
  progress: ProgressPoint[];
  errorTypes: ErrorType[];
  /** Số bài gần nhất dùng để thống kê lỗi */
  errorSampleSize: number;
  weaknesses: Weakness[];
}
