import { useQuery } from "@tanstack/react-query";
import { fetchLearningPath } from "./mock/pathData";
import type { LearningPath, PathStage } from "../../types/path";

export const PATH_KEY = ["student", "learning-path"] as const;

/**
 * Lộ trình học cá nhân của học sinh.
 * TODO: nối API thật khi backend có lộ trình (xem mock/pathData.ts).
 */
export function useLearningPath() {
  return useQuery({ queryKey: PATH_KEY, queryFn: fetchLearningPath, staleTime: 5 * 60 * 1000 });
}

export interface StageProgress {
  done: number;
  total: number;
  minutes: number;
  percent: number;
}

export function stageProgress(stage: PathStage): StageProgress {
  const total = stage.lessons.length;
  const done = stage.lessons.filter((l) => l.done).length;
  const minutes = stage.lessons.reduce((sum, l) => sum + l.minutes, 0);
  return { done, total, minutes, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/** Tiến độ tổng của cả lộ trình, tính từ các bài đã hoàn thành */
export function pathProgress(path: LearningPath): StageProgress {
  const parts = path.stages.map(stageProgress);
  const total = parts.reduce((sum, p) => sum + p.total, 0);
  const done = parts.reduce((sum, p) => sum + p.done, 0);
  const minutes = parts.reduce((sum, p) => sum + p.minutes, 0);
  return { done, total, minutes, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}
