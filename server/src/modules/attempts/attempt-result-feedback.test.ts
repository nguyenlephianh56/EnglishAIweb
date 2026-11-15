/**
 * Test thuần (KHÔNG cần DB): buildAttemptResult đọc ai_feedback an toàn (T13, bước 3a-1).
 */
import { describe, it, expect } from "vitest";
import { buildAttemptResult } from "./attempt-result";

const exercise = {
  id: 9,
  type: "writing",
  skill: "WRITING",
  level: "B1",
  topic: "Weekend",
  content: { prompt: "Write.", minWords: 50 },
  answer: null,
};

const ERRORS = [
  { type: "grammar:tense", text: "I goed", correction: "I went", explanation: "Quá khứ bất quy tắc" },
];

const CRITERIA = { content: 7, coherence: 6.5, vocabulary: 8, grammar: 6 };

const base = { id: 1, score: 6.88, maxScore: 10, errors: ERRORS };

describe("buildAttemptResult: criteria + comment", () => {
  it("có ai_feedback hợp lệ -> trả criteria + comment (reveal = false vẫn có)", () => {
    const r = buildAttemptResult(
      { ...base, aiFeedback: { criteria: CRITERIA, comment: "Bài khá tốt." } },
      exercise,
      { reveal: false }
    );
    expect(r.criteria).toEqual(CRITERIA);
    expect(r.comment).toBe("Bài khá tốt.");
  });

  it("reveal = false: errors chỉ còn { type, text }, criteria + comment vẫn có", () => {
    const r = buildAttemptResult(
      { ...base, aiFeedback: { criteria: CRITERIA, comment: "OK" } },
      exercise,
      { reveal: false }
    );
    expect(r.errors).toEqual([{ type: "grammar:tense", text: "I goed" }]);
    expect(r.criteria).toBeDefined();
    expect(r.comment).toBe("OK");
  });

  it("reveal = true: errors có correction + explanation", () => {
    const r = buildAttemptResult(
      { ...base, aiFeedback: { criteria: CRITERIA, comment: "OK" } },
      exercise,
      { reveal: true }
    );
    expect(r.errors[0]).toEqual(ERRORS[0]);
  });

  it("ai_feedback NULL / không có -> KHÔNG có key criteria, comment (dạng tự động giữ nguyên)", () => {
    for (const aiFeedback of [null, undefined]) {
      const r = buildAttemptResult({ ...base, aiFeedback }, exercise, { reveal: true });
      expect("criteria" in r).toBe(false);
      expect("comment" in r).toBe(false);
    }
  });

  it("ai_feedback hỏng (không phải object / mảng / chuỗi) -> bỏ, không ném lỗi", () => {
    for (const aiFeedback of ["abc", 5, [1, 2], true]) {
      const r = buildAttemptResult({ ...base, aiFeedback }, exercise, { reveal: true });
      expect("criteria" in r).toBe(false);
      expect("comment" in r).toBe(false);
    }
  });

  it("criteria thiếu 1 tiêu chí hoặc sai kiểu -> bỏ cả criteria, comment hợp lệ vẫn giữ", () => {
    const thieu = { content: 7, coherence: 6, vocabulary: 8 };
    const saiKieu = { ...CRITERIA, grammar: "6" };
    const nan = { ...CRITERIA, grammar: Number.NaN };
    for (const criteria of [thieu, saiKieu, nan]) {
      const r = buildAttemptResult(
        { ...base, aiFeedback: { criteria, comment: "Nhận xét" } },
        exercise,
        { reveal: true }
      );
      expect("criteria" in r).toBe(false);
      expect(r.comment).toBe("Nhận xét");
    }
  });

  it("comment rỗng / không phải chuỗi -> bỏ comment, criteria hợp lệ vẫn giữ", () => {
    for (const comment of ["", "   ", 123, null]) {
      const r = buildAttemptResult(
        { ...base, aiFeedback: { criteria: CRITERIA, comment } },
        exercise,
        { reveal: true }
      );
      expect("comment" in r).toBe(false);
      expect(r.criteria).toEqual(CRITERIA);
    }
  });

  it("danh sách trắng: key lạ trong ai_feedback và trong criteria không lọt ra", () => {
    const r = buildAttemptResult(
      {
        ...base,
        aiFeedback: {
          criteria: { ...CRITERIA, bonus: 10 },
          comment: "OK",
          rawResponse: "BAI-VIET-THO",
          text: "BAI-VIET-THO",
        },
      },
      exercise,
      { reveal: true }
    );
    expect(Object.keys(r.criteria!).sort()).toEqual(
      ["coherence", "content", "grammar", "vocabulary"]
    );
    expect(JSON.stringify(r)).not.toContain("BAI-VIET-THO");
    expect("aiFeedback" in r).toBe(false);
  });

  it("làm tròn 2 chữ số cho từng tiêu chí", () => {
    const r = buildAttemptResult(
      {
        ...base,
        aiFeedback: {
          criteria: { content: 7.126, coherence: 6, vocabulary: 8, grammar: 6 },
          comment: "OK",
        },
      },
      exercise,
      { reveal: true }
    );
    expect(r.criteria!.content).toBe(7.13);
  });
});