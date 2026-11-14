import { describe, expect, it } from "vitest";
import {
  WRITING_COMMENT_MAX,
  WRITING_ERROR_FIELD_MAX,
  WRITING_ERRORS_MAX,
  writingGradeResultSchema,
} from "./writing.schema";

const okError = {
  type: "grammar:tense",
  text: "I goes",
  correction: "I go",
  explanation: "Chủ ngữ I dùng động từ nguyên mẫu.",
};
const okCriteria = { content: 7, coherence: 6.5, vocabulary: 6, grammar: 5.5 };
const make = (over: Record<string, unknown> = {}) => ({
  criteria: okCriteria,
  comment: "Bài viết khá tốt.",
  errors: [okError],
  ...over,
});
const valid = (v: unknown) => writingGradeResultSchema.safeParse(v).success;

describe("writingGradeResultSchema - hợp lệ", () => {
  it("có lỗi -> qua, giữ nguyên dữ liệu", () => {
    const r = writingGradeResultSchema.safeParse(make());
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual(make());
  });

  it("errors rỗng -> qua (bài tốt)", () => {
    expect(valid(make({ errors: [] }))).toBe(true);
  });

  it("comment và các field lỗi được trim", () => {
    const r = writingGradeResultSchema.safeParse(
      make({
        comment: "  Tốt  ",
        errors: [{ ...okError, text: "  I goes ", correction: " I go ", explanation: " ok " }],
      })
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.comment).toBe("Tốt");
      expect(r.data.errors[0].text).toBe("I goes");
      expect(r.data.errors[0].correction).toBe("I go");
      expect(r.data.errors[0].explanation).toBe("ok");
    }
  });
});

describe("writingGradeResultSchema - điểm tiêu chí", () => {
  it("đúng biên 0 và 10 -> qua", () => {
    expect(valid(make({ criteria: { content: 0, coherence: 0, vocabulary: 10, grammar: 10 } }))).toBe(true);
  });

  it.each([
    ["-1", -1],
    ["10.01", 10.01],
    ["chuỗi", "7"],
    ["null", null],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("điểm %s -> sai", (_name, value) => {
    expect(valid(make({ criteria: { ...okCriteria, grammar: value } }))).toBe(false);
  });

  it.each(["content", "coherence", "vocabulary", "grammar"])("thiếu tiêu chí %s -> sai", (key) => {
    const criteria: Record<string, number> = { ...okCriteria };
    delete criteria[key];
    expect(valid(make({ criteria }))).toBe(false);
  });

  it("tiêu chí thừa (vd overall) -> sai", () => {
    expect(valid(make({ criteria: { ...okCriteria, overall: 7 } }))).toBe(false);
  });
});

describe("writingGradeResultSchema - errors[]", () => {
  it.each(["vocab", "grammar:article", "grammar:word_order", "spelling"])("type %s -> qua", (type) => {
    expect(valid(make({ errors: [{ ...okError, type }] }))).toBe(true);
  });

  it.each([
    ["hoa/thường lẫn", "Grammar:Tense"],
    ["toàn hoa", "VOCAB"],
    ["nhiều dấu :", "a:b:c"],
    ["rỗng", ""],
    ["thiếu chi tiết", "grammar:"],
    ["thiếu nhóm", ":tense"],
    ["có khoảng trắng", "grammar: tense"],
    ["dấu gạch ngang", "grammar-tense"],
  ])("type %s -> sai", (_name, type) => {
    expect(valid(make({ errors: [{ ...okError, type }] }))).toBe(false);
  });

  it.each(["type", "text", "correction", "explanation"])("thiếu field %s -> sai", (key) => {
    const e: Record<string, unknown> = { ...okError };
    delete e[key];
    expect(valid(make({ errors: [e] }))).toBe(false);
  });

  it("field thừa trong một lỗi -> sai", () => {
    expect(valid(make({ errors: [{ ...okError, severity: "high" }] }))).toBe(false);
  });

  it.each(["text", "correction", "explanation"])("field %s rỗng hoặc chỉ khoảng trắng -> sai", (key) => {
    expect(valid(make({ errors: [{ ...okError, [key]: "" }] }))).toBe(false);
    expect(valid(make({ errors: [{ ...okError, [key]: "   " }] }))).toBe(false);
  });

  it.each(["text", "correction", "explanation"])("field %s đúng biên 300 -> qua, 301 -> sai", (key) => {
    const at = "a".repeat(WRITING_ERROR_FIELD_MAX);
    expect(valid(make({ errors: [{ ...okError, [key]: at }] }))).toBe(true);
    expect(valid(make({ errors: [{ ...okError, [key]: at + "a" }] }))).toBe(false);
  });

  it("đúng biên 20 phần tử -> qua, 21 -> sai", () => {
    expect(valid(make({ errors: Array.from({ length: WRITING_ERRORS_MAX }, () => okError) }))).toBe(true);
    expect(valid(make({ errors: Array.from({ length: WRITING_ERRORS_MAX + 1 }, () => okError) }))).toBe(false);
  });

  it("errors không phải mảng -> sai", () => {
    expect(valid(make({ errors: okError }))).toBe(false);
  });
});

describe("writingGradeResultSchema - comment và cấp cao nhất", () => {
  it("comment rỗng hoặc chỉ khoảng trắng -> sai", () => {
    expect(valid(make({ comment: "" }))).toBe(false);
    expect(valid(make({ comment: "   \n\t " }))).toBe(false);
  });

  it("comment đúng biên 1000 -> qua, 1001 -> sai", () => {
    expect(valid(make({ comment: "a".repeat(WRITING_COMMENT_MAX) }))).toBe(true);
    expect(valid(make({ comment: "a".repeat(WRITING_COMMENT_MAX + 1) }))).toBe(false);
  });

  it("thiếu criteria / comment / errors -> sai", () => {
    for (const key of ["criteria", "comment", "errors"]) {
      const v: Record<string, unknown> = make();
      delete v[key];
      expect(valid(v)).toBe(false);
    }
  });

  it("field thừa ở cấp cao nhất (vd score) -> sai", () => {
    expect(valid(make({ score: 7 }))).toBe(false);
  });

  it("không phải object -> sai", () => {
    for (const v of [null, undefined, "x", 5, []]) expect(valid(v)).toBe(false);
  });
});