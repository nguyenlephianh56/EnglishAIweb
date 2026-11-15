import type { CefrLevel } from "./student";
import type { LibrarySkill } from "./library";

/** 7 dạng bài của backend */
export type ExerciseTypeKey = "multiple_choice" | "fill_blank" | "matching" | "error_correction" | "listening_fill" | "writing" | "speaking";

export type ExerciseStatus = "DRAFT" | "PROPOSED" | "PUBLISHED" | "HIDDEN";

/**
 * Một phần tử của GET /exercises. Giáo viên nhận đủ field (kể cả content/answer);
 * học sinh chỉ nhận id, type, skill, level, topic, content nên status/source... là tùy chọn.
 */
export interface ExerciseListItem {
  id: number;
  type: ExerciseTypeKey | string;
  skill: LibrarySkill;
  level: CefrLevel;
  topic: string;
  status?: ExerciseStatus;
  source?: "ADMIN" | "TEACHER" | "AI";
  inLibrary?: boolean;
  createdAt?: string;
  /** Chỉ giáo viên/admin nhận các field dưới đây */
  createdById?: number;
  updatedAt?: string;
  /** Nội dung đề: dạng khác nhau theo `type` (xem exerciseMeta.countQuestions) */
  content?: unknown;
  answer?: unknown;
  explanation?: string | null;
}

export interface ExerciseListResult {
  items: ExerciseListItem[];
  page: number;
  /** Backend trả `limit`; một số phiên bản trả `pageSize` nên khai báo cả hai */
  limit?: number;
  pageSize?: number;
  total: number;
}

export interface ExerciseListParams {
  skill?: LibrarySkill;
  level?: CefrLevel;
  type?: ExerciseTypeKey;
  /** Tìm gần đúng theo chủ đề (không phân biệt hoa/thường) */
  topic?: string;
  /** Chỉ giáo viên/admin được lọc theo trạng thái */
  status?: ExerciseStatus;
  page?: number;
  /** Tối đa 50 */
  pageSize?: number;
}

/** Body của POST /exercises (giáo viên: bài mới luôn ở trạng thái DRAFT) */
export interface CreateExercisePayload {
  type: ExerciseTypeKey | string;
  skill: LibrarySkill;
  level: CefrLevel;
  topic: string;
  content: unknown;
  answer?: unknown;
  explanation?: string | null;
}
