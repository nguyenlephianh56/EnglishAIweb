import type { CefrLevel } from "../../types/student";
import type { ExerciseType, LibraryFilters, LibrarySkill, LibrarySort } from "../../types/library";

export const SKILL_OPTIONS: { value: LibrarySkill; label: string }[] = [
  { value: "LISTENING", label: "Nghe" },
  { value: "SPEAKING", label: "Nói" },
  { value: "READING", label: "Đọc" },
  { value: "WRITING", label: "Viết" },
  { value: "FOUNDATION", label: "Nền tảng" },
];
export const LEVEL_OPTIONS: CefrLevel[] = ["A1", "A2", "B1", "B2"];
export const TYPE_OPTIONS: { value: ExerciseType; label: string }[] = [
  { value: "MULTIPLE_CHOICE", label: "Trắc nghiệm" },
  { value: "AI_GRADED", label: "AI chấm điểm" },
];
export const SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: "newest", label: "Mới nhất" },
  { value: "level", label: "Dễ → khó" },
];

/** Đọc bộ lọc từ URL (?skill=&level=&type=&topic=&q=&sort=&page=), bỏ qua giá trị không hợp lệ. */
export function parseFilters(params: URLSearchParams): LibraryFilters {
  const skill = params.get("skill");
  const level = params.get("level");
  const type = params.get("type");
  const sort = params.get("sort");
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  return {
    skill: SKILL_OPTIONS.find((o) => o.value === skill)?.value,
    level: LEVEL_OPTIONS.find((l) => l === level),
    type: TYPE_OPTIONS.find((o) => o.value === type)?.value,
    topic: params.get("topic") || undefined,
    q: params.get("q") ?? "",
    sort: sort === "level" ? "level" : "newest",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Số bộ lọc đang bật (không tính sắp xếp và trang) */
export const countActiveFilters = (f: LibraryFilters) => [f.skill, f.level, f.type, f.topic, f.q.trim()].filter(Boolean).length;
