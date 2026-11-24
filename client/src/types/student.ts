export type SkillKey = "LISTENING" | "SPEAKING" | "READING" | "WRITING";
export type CefrLevel = "A1" | "A2" | "B1" | "B2";

export interface SkillAxis {
  axis: string;
  /** 0-100 */
  value: number;
}

export interface SkillProfileSummary {
  level: CefrLevel;
  levelLabel: string;
  /** Điểm năng lực tổng, 0-100 */
  overall: number;
  /** Thay đổi điểm tổng trong tháng (âm = giảm) */
  monthlyDelta: number;
  axes: SkillAxis[];
}

/** Kết quả POST /classes/join */
export interface JoinedClass {
  id: number;
  name: string;
  teacher: { id: number; name: string };
  joinedAt: string;
}

/** Phần tử của GET /classes khi đăng nhập là học sinh */
export interface StudentClassItem {
  id: number;
  name: string;
  createdAt: string;
  teacher?: { id: number; name: string };
  /** Backend chưa trả trường này cho học sinh; có thì hiện, không có thì ẩn */
  studentCount?: number;
}
