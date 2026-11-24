import { formatScore } from "../../student/assignmentTime";
import type { SubmissionAttempt, SubmissionItem } from "../../../types/assignments";

/** Các lần nộp của học sinh, sắp theo attempt_no tăng dần (thiếu = []) */
export const sortedAttempts = (s: SubmissionItem): SubmissionAttempt[] => [...(s.attempts ?? [])].sort((a, b) => a.attempt_no - b.attempt_no);

/** "Chờ AI" khi đang chờ chấm và chưa có điểm giáo viên; ngược lại "x/10" (hoặc "—") */
export const attemptScoreText = (a: SubmissionAttempt): string => {
  if (a.grading_status === "PENDING" && a.teacher_score === null) return "Chờ AI";
  return a.final_score === null ? "—" : `${formatScore(a.final_score)}/10`;
};

/** Lần nộp cần mở khi chấm học sinh này: bài điểm cao nhất, nếu chưa có thì lần nộp cuối; null nếu chưa nộp */
export const gradingTargetId = (s: SubmissionItem): number | null => {
  if (s.bestAttemptId !== null) return s.bestAttemptId;
  const list = sortedAttempts(s);
  return list.length > 0 ? list[list.length - 1].id : null;
};
