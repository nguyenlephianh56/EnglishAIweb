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

/** Body của PATCH /exercises/:id: chỉ chứa field đổi (ít nhất một), KHÔNG có type/status. explanation = null để xóa. */
export interface UpdateExercisePayload {
  topic?: string;
  skill?: LibrarySkill;
  level?: CefrLevel;
  content?: unknown;
  answer?: unknown;
  explanation?: string | null;
}

/** Body của POST /exercises/generate (backend chặt: không nhận field nào khác) */
export interface GenerateExercisePayload {
  skill: LibrarySkill;
  level: CefrLevel;
  topic: string;
  type: ExerciseTypeKey;
  count: number;
}

/** Body của POST /exercises (giáo viên: bài mới luôn ở trạng thái DRAFT) */
export interface CreateExercisePayload {
  /** Chỉ quản trị viên: true = đăng ngay (PUBLISHED, vào thư viện) thay vì bản nháp */
  publish?: boolean;
  type: ExerciseTypeKey | string;
  skill: LibrarySkill;
  level: CefrLevel;
  topic: string;
  content: unknown;
  answer?: unknown;
  explanation?: string | null;
}

// ---------------------------------------------------------------------------
// Nội dung (content) và bài làm (value) của từng dạng bài, khớp backend.
// ---------------------------------------------------------------------------

/** Các dạng bài học sinh làm được trên giao diện (đủ 7 dạng, gồm "speaking" ghi âm) */
export type AnswerableExerciseType = ExerciseTypeKey;

export interface MultipleChoiceContent {
  passage?: string;
  questions: { q: string; options: string[] }[];
}
export interface FillBlankContent {
  /** Văn bản có các chỗ trống "___" */
  text: string;
  hint?: string;
}
export interface MatchingContent {
  left: string[];
  right: string[];
}
export interface ErrorCorrectionContent {
  sentence: string;
  /** Phần sai, xuất hiện nguyên văn trong `sentence` */
  wrong: string;
}
export interface ListeningFillContent {
  /** Bài hiển thị cho học sinh: các từ bị khuyết là "___" */
  script: string;
  blanks: number;
  /** Bản đọc đầy đủ (không khuyết), dùng cho âm thanh. Thiếu thì chưa phát được. */
  spoken?: string;
  /** API tương đối với /api/v1, do màn làm bài đặt theo ngữ cảnh. */
  audioPath?: string;
}
export interface WritingContent {
  prompt: string;
  minWords: number;
}

/** Bài Nói: chỉ hiện `prompt` cho học sinh; `sample` (câu mẫu) KHÔNG bao giờ được hiển thị */
export interface SpeakingContent {
  prompt: string;
  sample?: string;
}

export interface ExerciseContentMap {
  multiple_choice: MultipleChoiceContent;
  fill_blank: FillBlankContent;
  matching: MatchingContent;
  error_correction: ErrorCorrectionContent;
  listening_fill: ListeningFillContent;
  writing: WritingContent;
  speaking: SpeakingContent;
}

/** Vị trí lựa chọn từng câu, bắt đầu từ 0; -1 = chưa chọn (khi đang làm dở) */
export type MultipleChoiceValue = number[];
export type FillBlankValue = string[];
/** Mỗi cặp là [chỉ số bên trái, chỉ số bên phải] */
export type MatchingValue = [number, number][];
/** Đúng 1 phần tử: bản sửa cho phần `wrong` */
export type ErrorCorrectionValue = string[];
export type ListeningFillValue = string[];
export interface WritingValue {
  text: string;
}

/** Bài Nói: bản ghi âm đang giữ trên máy (chưa tải lên) và độ dài tính bằng giây. Không lưu nháp. */
export interface SpeakingValue {
  blob: Blob | null;
  durationSec: number;
}

/** Giá trị học sinh làm = đúng body `answer` gửi lên backend */
export interface ExerciseValueMap {
  multiple_choice: MultipleChoiceValue;
  fill_blank: FillBlankValue;
  matching: MatchingValue;
  error_correction: ErrorCorrectionValue;
  listening_fill: ListeningFillValue;
  writing: WritingValue;
  speaking: SpeakingValue;
}

export type ExerciseContent<T extends AnswerableExerciseType> = ExerciseContentMap[T];
export type ExerciseValue<T extends AnswerableExerciseType> = ExerciseValueMap[T];