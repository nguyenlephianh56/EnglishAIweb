import { questionCount } from "../contentUtils";

// ---- Thời lượng thi thử (giây): chỉnh các hằng số này để đổi thời gian ----
export const EXAM_MIN_SEC = 180;
export const EXAM_MAX_SEC = 1800;
const SEC_PER_QUESTION = 60; // multiple_choice: mỗi câu
const SEC_PER_BLANK = 45; // fill_blank: mỗi chỗ trống
const SEC_PER_PAIR = 30; // matching: mỗi cặp
const ERROR_CORRECTION_SEC = 120;
const SEC_PER_LISTENING_BLANK = 60; // listening_fill: mỗi chỗ trống, cộng thêm thời gian nghe
const LISTENING_EXTRA_SEC = 120;
const WRITING_MIN_SEC = 600;
const SEC_PER_WRITING_WORD = 6; // writing: minWords * 6 giây
const SPEAKING_SEC = 300;
const FALLBACK_SEC = 300; // không đọc được đề

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const clamp = (n: number) => Math.min(EXAM_MAX_SEC, Math.max(EXAM_MIN_SEC, Math.round(n)));

/** Thời gian thi (giây) theo dạng bài và số câu, luôn trong khoảng 180..1800 giây */
export function examDurationSec(exercise: { type: string; content?: unknown }): number {
  const count = questionCount(exercise);
  const n = typeof count === "number" ? count : null;
  switch (exercise.type) {
    case "multiple_choice":
      return clamp(n === null ? FALLBACK_SEC : n * SEC_PER_QUESTION);
    case "fill_blank":
      return clamp(n === null ? FALLBACK_SEC : n * SEC_PER_BLANK);
    case "matching":
      return clamp(n === null ? FALLBACK_SEC : n * SEC_PER_PAIR);
    case "error_correction":
      return clamp(ERROR_CORRECTION_SEC);
    case "listening_fill":
      return clamp(n === null ? FALLBACK_SEC : n * SEC_PER_LISTENING_BLANK + LISTENING_EXTRA_SEC);
    case "writing": {
      const minWords = asRecord(exercise.content).minWords;
      return clamp(Math.max(WRITING_MIN_SEC, (typeof minWords === "number" ? minWords : 0) * SEC_PER_WRITING_WORD));
    }
    case "speaking":
      return clamp(SPEAKING_SEC);
    default:
      return clamp(FALLBACK_SEC);
  }
}

/** 125 -> "02:05" */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// ---- Phiên thi lưu trong sessionStorage để tải lại trang không được cấp thêm giờ ----
export interface ExamSession {
  /** Thời điểm hết giờ (ms, Date.now()) */
  deadline: number;
  durationSec: number;
}

const key = (exerciseId: number) => `exam-${exerciseId}`;

export function loadExamSession(exerciseId: number): ExamSession | null {
  try {
    const raw = window.sessionStorage.getItem(key(exerciseId));
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<ExamSession> | null;
    if (o && typeof o.deadline === "number" && Number.isFinite(o.deadline) && typeof o.durationSec === "number" && o.durationSec > 0) return { deadline: o.deadline, durationSec: o.durationSec };
  } catch {
    /* bỏ qua */
  }
  return null;
}

export function saveExamSession(exerciseId: number, session: ExamSession) {
  try {
    window.sessionStorage.setItem(key(exerciseId), JSON.stringify(session));
  } catch {
    /* bỏ qua */
  }
}

export function clearExamSession(exerciseId: number) {
  try {
    window.sessionStorage.removeItem(key(exerciseId));
  } catch {
    /* bỏ qua */
  }
}
