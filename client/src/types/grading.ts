/**
 * Kiểu dữ liệu màn Chấm bài viết.
 * TODO(backend): hiện CHƯA có API cho giáo viên đọc bài làm và sửa điểm, nên màn này dùng dữ liệu giả
 * (features/teacher/mock/gradingData.ts). Phần `ai` bám đúng dạng AI chấm bài viết của backend:
 * criteria {content, coherence, vocabulary, grammar} (0–10), comment (tiếng Việt), errors [{type, text, correction, explanation}].
 */

export type CriteriaKey = "content" | "coherence" | "vocabulary" | "grammar";
export type WritingCriteria = Record<CriteriaKey, number>;

/** Một lỗi AI tìm thấy. KHÔNG có vị trí trong bài, chỉ có đoạn `text` (xem gradingMeta.locateErrors). */
export interface WritingError {
  /** Dạng "nhóm:chi tiết" viết thường, ví dụ "grammar:tense" */
  type: string;
  text: string;
  correction: string;
  explanation: string;
}

export interface AiWritingFeedback {
  criteria: WritingCriteria;
  comment: string;
  errors: WritingError[];
}

export type GradingStatus = "PENDING" | "GRADED";

export interface GradeHistoryEntry {
  id: string;
  by: "AI" | "TEACHER";
  total: number;
  at: string;
}

/** Điểm giáo viên đã lưu */
export interface TeacherGrade {
  criteria: WritingCriteria;
  total: number;
  comment: string;
  gradedAt: string;
}

export interface GradingSubmission {
  id: number;
  studentName: string;
  exerciseTitle: string;
  className: string;
  submittedAt: string;
  dueAt: string;
  status: GradingStatus;
  /** Số phút học sinh làm bài */
  durationMin: number;
  text: string;
  ai: AiWritingFeedback;
  teacher?: TeacherGrade;
  history: GradeHistoryEntry[];
}

/** Một dòng ở danh sách "Bài cần chấm" */
export type GradingListItem = Pick<GradingSubmission, "id" | "studentName" | "exerciseTitle" | "className" | "submittedAt" | "dueAt" | "status">;

export interface SaveGradePayload {
  criteria: WritingCriteria;
  total: number;
  comment: string;
}
