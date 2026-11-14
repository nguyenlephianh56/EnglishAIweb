import type { LibrarySkill } from "./library";
import type { CefrLevel } from "./student";

export type StageStatus = "DONE" | "CURRENT" | "LOCKED";

export interface PathLesson {
  id: number;
  title: string;
  minutes: number;
  done: boolean;
}

export interface PathStage {
  id: number;
  title: string;
  skill: LibrarySkill;
  /** Vì sao AI đưa chặng này vào lộ trình */
  reason: string;
  status: StageStatus;
  lessons: PathLesson[];
}

export interface LearningPath {
  fromLevel: CefrLevel;
  toLevel: CefrLevel;
  /** Mục tiêu tuần: số bài đã làm / số bài cần làm */
  weeklyGoal: { done: number; total: number };
  stages: PathStage[];
}
