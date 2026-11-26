import { api, unwrap } from "../../api/client";
import type { AttemptDetail, StudentExercise } from "../../types/attempt";
import type { LibraryFilters } from "../../types/library";

export const PRACTICE_HISTORY_KEY = ["student", "practice-history"] as const;

export type PracticeHistoryFilters = Pick<LibraryFilters, "page" | "skill" | "level" | "type"> & {
  status?: "graded" | "pending";
};

interface PracticeHistoryItem {
  id: number;
  submittedAt: string;
  score: number | null;
  maxScore: number;
  exercise: Pick<StudentExercise, "topic" | "skill" | "level" | "type">;
}

interface PracticeHistoryResponse {
  items: PracticeHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PracticeHistoryDetail extends AttemptDetail {
  reviewExercise: StudentExercise;
  canRetake: boolean;
}

export function listPracticeHistory(params: PracticeHistoryFilters, signal: AbortSignal) {
  return unwrap<PracticeHistoryResponse>(api.get("/attempts/practice-history", { params, signal }));
}

export function getPracticeHistoryAttempt(id: number) {
  return unwrap<PracticeHistoryDetail>(api.get(`/attempts/practice-history/${id}`));
}

const submittedAtFormat = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatPracticeSubmissionTime(iso: string) {
  return submittedAtFormat.format(new Date(iso));
}