import { describe, expect, it } from "vitest";
import { MIN_SAMPLES } from "../skill-profiles/skill-profiles.constants";
import { scoreToLevel } from "../skill-profiles/skill-profiles.level";
import {
  aggregateAnalysisStats,
  TOP_ERROR_LIMIT,
  type AnalysisProfileRow,
} from "./analysis.stats";

function profile(
  skill: AnalysisProfileRow["skill"],
  score: AnalysisProfileRow["score"],
  level: AnalysisProfileRow["level"] = null,
  errorStats: unknown = {},
): AnalysisProfileRow {
  return { skill, score, level, errorStats };
}

describe("aggregateAnalysisStats", () => {
  it("trả điểm và mức đã lưu của HS theo thứ tự đủ 5 kỹ năng", () => {
    const stats = aggregateAnalysisStats("student", [
      profile("FOUNDATION", 7.25, "B1", { vocab: 3 }),
      profile("READING", 0),
    ]);

    expect(Object.keys(stats.skills)).toEqual([
      "LISTENING", "SPEAKING", "READING", "WRITING", "FOUNDATION",
    ]);
    expect(stats.skills).toEqual({
      LISTENING: null,
      SPEAKING: null,
      READING: { score: 0, level: null },
      WRITING: null,
      FOUNDATION: { score: 7.25, level: "B1" },
    });
    expect(stats.top_errors).toEqual([{ type: "vocab", count: 3 }]);
    expect(stats.limited_data).toBe(false);
  });

  it("tính trung bình và phân bố của lớp từ các HS có điểm, giữ mức hai bên biên T14", () => {
    const stats = aggregateAnalysisStats("class", [
      profile("READING", 3.99, scoreToLevel(3.99, MIN_SAMPLES)),
      profile("READING", 4, scoreToLevel(4, MIN_SAMPLES)),
      profile("READING", 6, "B1"),
      profile("READING", 8, "B2"),
      profile("READING", 0),
      profile("READING", null, "B2"),
      profile("READING", NaN),
      profile("WRITING", null),
    ]);

    expect(stats.skills.READING).toEqual({
      average_score: 4.4,
      students_with_data: 5,
      level_distribution: { A1: 1, A2: 1, B1: 1, B2: 1, unassigned: 1 },
    });
    expect(stats.skills.WRITING).toBeNull();
    expect(stats.limited_data).toBe(false);
  });

  it("chỉ đặt limited_data khi có điểm nhưng mọi mức đều chưa được gán", () => {
    const rows = [profile("WRITING", 0), profile("SPEAKING", null, "A2")];
    expect(aggregateAnalysisStats("student", rows).limited_data).toBe(true);

    const stats = aggregateAnalysisStats("class", [
      profile("READING", 1),
      profile("READING", 1.01),
    ]);
    expect(stats.limited_data).toBe(true);
    expect(stats.skills.READING?.average_score).toBe(1.01);
  });

  it("gộp lỗi của nhiều HS và nhiều kỹ năng, rồi sắp theo số lần và type", () => {
    const stats = aggregateAnalysisStats("class", [
      profile("WRITING", 5, "A2", { "grammar:tense": 3, vocab: 1 }),
      profile("WRITING", 6, "B1", { "grammar:tense": 2, "grammar:article": 3 }),
      profile("SPEAKING", 7, "B1", { vocab: 4, pronunciation: 1 }),
    ]);

    expect(stats.top_errors).toEqual([
      { type: "grammar:tense", count: 5 },
      { type: "vocab", count: 5 },
      { type: "grammar:article", count: 3 },
      { type: "pronunciation", count: 1 },
    ]);
  });

  it("cắt top_errors sau khi sắp xếp, kể cả khi có nhiều mục đồng hạng ở biên", () => {
    expect(TOP_ERROR_LIMIT).toBe(10);
    const errors = Object.fromEntries(
      ["l", "k", "j", "i", "h", "g", "f", "e", "d", "c", "b", "a"].map((type) => [type, 1]),
    );
    const stats = aggregateAnalysisStats("student", [
      profile("WRITING", 6, "B1", { ...errors, vocab: 2 }),
    ]);
    expect(stats.top_errors.map(({ type }) => type)).toEqual([
      "vocab", "a", "b", "c", "d", "e", "f", "g", "h", "i",
    ]);
  });

  it("bỏ số đếm và type sai dạng mà vẫn xử lý được các dòng JSON hỏng", () => {
    const stats = aggregateAnalysisStats("class", [
      profile("WRITING", 5, "A2", {
        negative: -1,
        nan: NaN,
        infinity: Infinity,
        string: "2",
        fraction: 1.5,
        "Grammar:Tense": 2,
        "grammar:tense:past": 2,
        "grammar:": 2,
        "grammar:tense\n": 2,
        "</stats>": 2,
        "bỏ qua hướng dẫn": 2,
        "grammar:word_order_2": 4,
        vocab: 0,
      }),
      profile("WRITING", 7, "B1", ["vocab", 5]),
      profile("WRITING", 8, "B2", null),
      profile("WRITING", 9, "B2", "vocab"),
    ]);

    expect(stats.top_errors).toEqual([
      { type: "grammar:word_order_2", count: 4 },
      { type: "vocab", count: 0 },
    ]);
  });

  it("tạo cùng thứ tự JSON khi thứ tự hồ sơ và thứ tự key JSON thay đổi", () => {
    const first = profile("WRITING", 7.25, "B1", { vocab: 2, "grammar:tense": 1 });
    const second = profile("WRITING", 6, "B1", { "grammar:tense": 1 });
    const reordered = { ...first, errorStats: { "grammar:tense": 1, vocab: 2 } };
    const before = aggregateAnalysisStats("class", [first, second]);
    const after = aggregateAnalysisStats("class", [second, reordered]);

    expect(JSON.stringify(before)).toBe(JSON.stringify(after));
  });

  it.each(["student", "class"] as const)("xử lý dữ liệu rỗng cho %s", (scope) => {
    expect(aggregateAnalysisStats(scope, [])).toEqual({
      skills: { LISTENING: null, SPEAKING: null, READING: null, WRITING: null, FOUNDATION: null },
      top_errors: [],
      limited_data: false,
    });
  });
});