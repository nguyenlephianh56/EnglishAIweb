import { formatDate } from "../../../utils/format";
import { SKILL_OPTIONS, LEVEL_OPTIONS } from "../../student/libraryFilters";
import { TYPE_LABEL } from "../assignments/assignmentMeta";
import type { CefrLevel } from "../../../types/student";
import type { LibrarySkill } from "../../../types/library";
import type { ExerciseListItem, ExerciseStatus, ExerciseTypeKey } from "../../../types/exercise";

export type ExerciseTab = "mine" | "library" | "draft";

export const TABS: { id: ExerciseTab; label: string }[] = [
  { id: "mine", label: "Bài của tôi" },
  { id: "library", label: "Thư viện chung" },
  { id: "draft", label: "Bản nháp" },
];

export const STATUS_BADGE: Record<ExerciseStatus, { label: string; className: string }> = {
  DRAFT: { label: "Nháp", className: "bg-slate-100 text-slate-600" },
  PROPOSED: { label: "Chờ duyệt", className: "bg-amber-50 text-amber-700" },
  PUBLISHED: { label: "Đã xuất bản", className: "bg-green-50 text-green-700" },
  HIDDEN: { label: "Ẩn", className: "bg-red-50 text-red-600" },
};

/** Đủ 7 dạng bài để lọc (gửi lên API qua ?type=) */
export const TYPE_FILTER_OPTIONS: { value: ExerciseTypeKey; label: string }[] = (Object.keys(TYPE_LABEL) as ExerciseTypeKey[]).map((value) => ({ value, label: TYPE_LABEL[value] }));

export interface ExerciseFilters {
  tab: ExerciseTab;
  q: string;
  skill?: LibrarySkill;
  level?: CefrLevel;
  type?: ExerciseTypeKey;
  page: number;
}

/** Đọc bộ lọc từ URL (?tab=&q=&skill=&level=&type=&page=), bỏ qua giá trị không hợp lệ. */
export function parseExerciseFilters(params: URLSearchParams): ExerciseFilters {
  const tab = params.get("tab");
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  return {
    tab: TABS.find((t) => t.id === tab)?.id ?? "mine",
    q: params.get("q") ?? "",
    skill: SKILL_OPTIONS.find((o) => o.value === params.get("skill"))?.value,
    level: LEVEL_OPTIONS.find((l) => l === params.get("level")),
    type: TYPE_FILTER_OPTIONS.find((o) => o.value === params.get("type"))?.value,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Số bộ lọc "nâng cao" đang bật (kỹ năng, cấp độ, dạng bài) */
export const countAdvancedFilters = (f: ExerciseFilters) => [f.skill, f.level, f.type].filter(Boolean).length;

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/**
 * SỐ CÂU tính từ content theo dạng bài. Trả về số, hoặc chữ ("AI chấm"), hoặc null nếu không đọc được.
 * - multiple_choice: content.questions.length   - fill_blank: số chỗ trống "___"
 * - matching: content.left.length               - error_correction: 1
 * - listening_fill: content.blanks (số hoặc mảng) - writing/speaking: "AI chấm"
 */
export function questionCount(item: Pick<ExerciseListItem, "type" | "content">): number | string | null {
  const c = asRecord(item.content);
  switch (item.type) {
    case "multiple_choice":
      return Array.isArray(c.questions) ? c.questions.length : null;
    case "fill_blank":
      return typeof c.text === "string" ? (c.text.match(/_{3,}/g) ?? []).length : null;
    case "matching":
      return Array.isArray(c.left) ? c.left.length : null;
    case "error_correction":
      return 1;
    case "listening_fill":
      if (typeof c.blanks === "number") return c.blanks;
      return Array.isArray(c.blanks) ? c.blanks.length : null;
    case "writing":
    case "speaking":
      return "AI chấm";
    default:
      return null;
  }
}

/** "Hôm nay" / "Hôm qua" / "dd/MM/yyyy" */
export function formatUpdated(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return "Hôm nay";
  if (d.toDateString() === yesterday.toDateString()) return "Hôm qua";
  return formatDate(d);
}

/** Dòng nhỏ "Chủ đề: ..." dưới tên bài; bỏ khi trùng với tên bài (backend chỉ có một trường topic nên thường trùng). */
export function topicSubline(title: string, topic: string): string | undefined {
  return topic.trim() && topic.trim().toLowerCase() !== title.trim().toLowerCase() ? `Chủ đề: ${topic}` : undefined;
}
