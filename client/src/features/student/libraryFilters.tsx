import type { CefrLevel } from "../../types/student";
import type { ExerciseTypeKey, LibraryFilters, LibrarySkill } from "../../types/library";

export const SKILL_OPTIONS: { value: LibrarySkill; label: string }[] = [
  { value: "LISTENING", label: "Nghe" },
  { value: "SPEAKING", label: "Nói" },
  { value: "READING", label: "Đọc" },
  { value: "WRITING", label: "Viết" },
  { value: "FOUNDATION", label: "Nền tảng" },
];
export const LEVEL_OPTIONS: CefrLevel[] = ["A1", "A2", "B1", "B2"];
export const TYPE_OPTIONS: { value: ExerciseTypeKey; label: string }[] = [
  { value: "multiple_choice", label: "Trắc nghiệm" },
  { value: "fill_blank", label: "Điền chỗ trống" },
  { value: "matching", label: "Nối cặp" },
  { value: "error_correction", label: "Sửa lỗi" },
  { value: "listening_fill", label: "Nghe điền từ" },
  { value: "writing", label: "Viết (AI chấm)" },
];

/** Đọc bộ lọc từ URL (?skill=&level=&type=&topic=&q=&page=), bỏ qua giá trị không hợp lệ. */
export function parseFilters(params: URLSearchParams): LibraryFilters {
  const skill = params.get("skill");
  const level = params.get("level");
  const type = params.get("type");
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  return {
    skill: SKILL_OPTIONS.find((o) => o.value === skill)?.value,
    level: LEVEL_OPTIONS.find((l) => l === level),
    type: TYPE_OPTIONS.find((o) => o.value === type)?.value,
    topic: params.get("topic") || undefined,
    q: params.get("q") ?? "",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Số bộ lọc đang bật (không tính trang) */
export const countActiveFilters = (f: LibraryFilters) => [f.skill, f.level, f.type, f.topic, f.q.trim()].filter(Boolean).length;
