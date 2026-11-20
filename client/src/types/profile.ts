import type { CefrLevel, SkillAxis, SkillKey } from "./student";

export type ProfileRange = "7d" | "30d" | "90d";

export interface SkillScore {
  skill: SkillKey;
  /** 0-100 (chưa có dữ liệu thì là 0, xem hasData) */
  score: number;
  /** false khi kỹ năng này chưa có điểm */
  hasData: boolean;
  /** Thay đổi điểm trong khoảng thời gian đang chọn (âm = giảm) */
  delta: number;
}

/** Một mốc thời gian (một ngày) của biểu đồ tiến bộ: điểm 4 kỹ năng; null = kỹ năng chưa có mốc nào trong khoảng đang chọn */
export type ProgressPoint = { label: string } & Record<SkillKey, number | null>;

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
  /** Điểm trung bình các kỹ năng đã có điểm, 0-100 */
  overall: number;
  skills: SkillScore[];
  progress: ProgressPoint[];
  errorTypes: ErrorType[];
  /** Tổng số lỗi dùng để thống kê */
  errorSampleSize: number;
  weaknesses: Weakness[];
}
