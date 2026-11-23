import type { CefrLevel } from "./student";
import type { LibrarySkill } from "./library";
import type { AttemptCriteria, AttemptError } from "./attempt";

/** GET /attempts/:id/review (giáo viên/quản trị): bài nộp của học sinh kèm đề, đáp án đúng và phản hồi AI. Điểm thang 0..10. */
export interface AttemptReview {
  attempt_id: number;
  student: { id: number; name: string };
  assignment: { id: number; due_at: string; class: { id: number; name: string } };
  exercise: {
    id: number;
    type: string;
    skill: LibrarySkill;
    level: CefrLevel;
    topic: string;
    content: unknown;
    answer: unknown;
    explanation: string | null;
  };
  /** Bài làm của học sinh (bài Viết/Nói: { text }) */
  submitted_answer: unknown;
  /** Điểm AI hoặc chấm tự động; null = đang chờ chấm */
  score: number | null;
  max_score: number;
  teacher_score: number | null;
  teacher_comment: string | null;
  /** teacher_score ?? score */
  final_score: number | null;
  /** Chỉ bài Viết/Nói đã được AI chấm */
  ai_feedback: { criteria?: AttemptCriteria | null; comment?: string | null } | null;
  errors: AttemptError[];
  is_late: boolean;
  submitted_at: string;
}

/** Body của PATCH /attempts/:id/grade: ít nhất một key, không key nào khác. null = xóa. */
export interface TeacherGradeBody {
  /** 0..10, tối đa 2 chữ số thập phân */
  teacher_score?: number | null;
  /** 1..1000 ký tự */
  teacher_comment?: string | null;
}

export interface TeacherGradeResult {
  id: number;
  score: number | null;
  teacher_score: number | null;
  teacher_comment: string | null;
  final_score: number | null;
  max_score: number;
}
