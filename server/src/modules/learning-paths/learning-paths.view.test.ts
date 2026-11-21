import { describe, expect, it } from "vitest";
import { toLearningPathView, type PathRow } from "./learning-paths.view";

const ex = (id: number, over: Partial<{ status: string; inLibrary: boolean }> = {}) => ({
  id,
  type: "fill_blank",
  skill: "WRITING",
  level: "A1",
  topic: `topic ${id}`,
  status: "PUBLISHED",
  inLibrary: true,
  content: { text: "SECRET" }, // field thừa phải bị bỏ
  answer: ["SECRET"],
  ...over,
});

const base = (items: PathRow["items"]): PathRow => ({
  id: 7,
  weekStart: new Date("2026-11-16T00:00:00.000Z"),
  createdAt: new Date("2026-11-18T03:04:05.678Z"),
  items,
});

describe("toLearningPathView", () => {
  it("trả đúng hình dạng, week_start dạng YYYY-MM-DD, created_at ISO", () => {
    const view = toLearningPathView(base([{ id: 1, title: "Luyện Viết mức A1", done: false, exercise: ex(10) }]));
    expect(Object.keys(view).sort()).toEqual(["created_at", "id", "items", "progress", "week_start"]);
    expect(view.week_start).toBe("2026-11-16");
    expect(view.created_at).toBe("2026-11-18T03:04:05.678Z");
    expect(Object.keys(view.items[0]).sort()).toEqual(["done", "exercise", "id", "title"]);
    expect(view.items[0].exercise).toEqual({ id: 10, type: "fill_blank", skill: "WRITING", level: "A1", topic: "topic 10" });
    expect(JSON.stringify(view)).not.toContain("SECRET");
  });

  it("exercise = null khi bài đã xóa, HIDDEN, hoặc không còn trong thư viện", () => {
    const view = toLearningPathView(
      base([
        { id: 1, title: "a", done: false, exercise: null },
        { id: 2, title: "b", done: false, exercise: ex(11, { status: "HIDDEN" }) },
        { id: 3, title: "c", done: false, exercise: ex(12, { inLibrary: false }) },
        { id: 4, title: "d", done: false, exercise: ex(13) },
      ])
    );
    expect(view.items.map((item) => item.exercise?.id ?? null)).toEqual([null, null, null, 13]);
  });

  it("progress tính từ items", () => {
    const view = toLearningPathView(
      base([
        { id: 1, title: "a", done: true, exercise: ex(1) },
        { id: 2, title: "b", done: false, exercise: ex(2) },
        { id: 3, title: "c", done: true, exercise: null },
      ])
    );
    expect(view.progress).toEqual({ done: 2, total: 3 });
  });

  it("lộ trình rỗng -> progress 0/0", () => {
    expect(toLearningPathView(base([])).progress).toEqual({ done: 0, total: 0 });
  });
});