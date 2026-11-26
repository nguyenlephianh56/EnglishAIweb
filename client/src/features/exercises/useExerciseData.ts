import { useQuery } from "@tanstack/react-query";
import { getStudentExercise } from "../../api/exercises";
import { getStudentAssignment } from "../../api/assignments";
import { getAttempt } from "../../api/attempts";
import type { AttemptDetail } from "../../types/attempt";
import { getPracticeHistoryAttempt } from "../student/practiceHistory";
import type { PracticeHistoryDetail } from "../student/practiceHistory";

const validId = (id: number) => Number.isInteger(id) && id > 0;

export const practiceExerciseKey = (id: number) => ["student", "exercise", id] as const;
export const assignmentDetailKey = (id: number) => ["student", "assignment", id] as const;
export const attemptKey = (id: number) => ["student", "attempt", id] as const;

/** Đề của bài tự luyện (GET /exercises/:id): không có đáp án */
export const usePracticeExercise = (id: number) =>
  useQuery({ queryKey: practiceExerciseKey(id), queryFn: () => getStudentExercise(id), enabled: validId(id), retry: false, staleTime: 5 * 60 * 1000 });

/** Chi tiết bài giao + đề (GET /assignments/:id). staleTime ngắn vì số lượt đã dùng đổi sau mỗi lần nộp. */
export const useAssignmentDetail = (id: number) =>
  useQuery({ queryKey: assignmentDetailKey(id), queryFn: () => getStudentAssignment(id), enabled: validId(id), retry: false, staleTime: 15 * 1000 });

/** Một lần nộp (GET /attempts/:id) */
export const useAttemptDetail = (id: number, fromHistory = false) =>
  useQuery<AttemptDetail & Partial<Pick<PracticeHistoryDetail, "reviewExercise" | "canRetake">>>({
    queryKey: fromHistory ? [...attemptKey(id), "history"] : attemptKey(id),
    queryFn: () => fromHistory ? getPracticeHistoryAttempt(id) : getAttempt(id),
    enabled: validId(id),
    retry: false,
  });