export type SkillKey = "LISTENING" | "SPEAKING" | "READING" | "WRITING";
export type CefrLevel = "A1" | "A2" | "B1" | "B2";

export interface Assignment {
  id: number;
  title: string;
  skill: SkillKey;
  teacherName: string;
  className: string;
  /** Hạn nộp, dạng ISO 8601 */
  dueAt: string;
  status: "TODO" | "SUBMITTED";
  /** Bài trắc nghiệm/điền từ/nghe */
  questionCount?: number;
  minutes?: number;
  /** Bài Viết */
  minWords?: number;
  maxWords?: number;
}

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

export interface Recommendation {
  id: number;
  skill: SkillKey;
  title: string;
  description: string;
  level: CefrLevel;
  minutes: number;
  topic: string;
}

export interface HomeData {
  streak: number;
  assignments: Assignment[];
  skillProfile: SkillProfileSummary;
  recommendation: Recommendation | null;
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
