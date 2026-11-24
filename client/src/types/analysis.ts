import type { LibrarySkill } from "./library";
import type { CefrLevel } from "./student";

/** Phân tích bằng AI của MỘT lớp hoặc MỘT học sinh (POST /analysis/classes/:id, /analysis/students/:id) */

export interface ClassSkillStat {
  /** 0..10 */
  average_score: number;
  students_with_data: number;
  level_distribution: { A1: number; A2: number; B1: number; B2: number; unassigned: number };
}

export interface StudentSkillStat {
  /** 0..10 */
  score: number;
  level: CefrLevel | null;
}

export interface TopError {
  /** Dạng "nhóm:chi tiết", ví dụ "grammar:tense" */
  type: string;
  count: number;
}

export interface AnalysisWeakness {
  skill: LibrarySkill;
  error_type: string | null;
  description: string;
}

export interface AnalysisSuggestion {
  skill: LibrarySkill | null;
  text: string;
}

export interface AnalysisText {
  summary: string;
  weaknesses: AnalysisWeakness[];
  suggestions: AnalysisSuggestion[];
}

export interface AnalysisResult<S> {
  scope: "class" | "student";
  target: { id: number; name: string };
  stats: {
    /** null = chưa có dữ liệu kỹ năng đó */
    skills: Record<LibrarySkill, S | null>;
    top_errors: TopError[];
    limited_data: boolean;
  };
  analysis: AnalysisText;
  /** ISO 8601 */
  generated_at: string;
}

export type ClassAnalysis = AnalysisResult<ClassSkillStat>;
export type StudentAnalysis = AnalysisResult<StudentSkillStat>;
