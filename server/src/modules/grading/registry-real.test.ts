import { describe, it, expect } from "vitest";
import { gradeExercise } from "./gradeExercise";

/**
 * Chốt "registry không còn stub": với bài làm đúng hoàn toàn, cả 5 dạng chấm tự động
 * phải ra 10 điểm (stub cũ luôn trả 0), và bài làm sai hết phải ra 0 kèm errors
 * đúng nhóm. Dùng hàm thật, không mock (registry-routing.test.ts là bản dùng mock).
 */
const CASES = [
  {
    type: "multiple_choice" as const,
    content: { questions: [{ q: "q1", options: ["a", "b"] }, { q: "q2", options: ["c", "d"] }] },
    answer: [1, 0],
    right: [1, 0],
    wrong: [0, 1],
    errorType: "reading:wrong_choice",
  },
  {
    type: "fill_blank" as const,
    content: { text: "A ___ B ___" },
    answer: ["x", "y"],
    right: [" X ", "y"],
    wrong: ["a", "b"],
    errorType: "foundation:wrong_blank",
  },
  {
    type: "matching" as const,
    content: { left: ["l0", "l1"], right: ["r0", "r1"] },
    answer: [[0, 1], [1, 0]],
    right: [[1, 0], [0, 1]],
    wrong: [[0, 0], [1, 1]],
    errorType: "foundation:wrong_match",
  },
  {
    type: "error_correction" as const,
    content: { sentence: "She go.", wrong: "go" },
    answer: ["goes"],
    right: ["GOES"],
    wrong: ["went"],
    errorType: "writing:wrong_correction",
  },
  {
    type: "listening_fill" as const,
    content: { script: "He goes.", blanks: 1 },
    answer: ["goes"],
    right: [" Goes"],
    wrong: ["go"],
    errorType: "listening:wrong_blank",
  },
];

describe.each(CASES)("registry: $type dùng hàm chấm thật", (c) => {
  it("bài làm đúng hoàn toàn -> 10, không lỗi (không phải stub)", () => {
    const r = gradeExercise(c.type, c.content, c.answer as never, c.right as never);
    expect(r.score).toBe(10);
    expect(r.correct).toBe(r.total);
    expect(r.errors).toEqual([]);
  });

  it("bài làm sai hết -> 0, mỗi câu một lỗi đúng nhóm", () => {
    const r = gradeExercise(c.type, c.content, c.answer as never, c.wrong as never);
    expect(r.score).toBe(0);
    expect(r.errors).toHaveLength(r.total);
    expect(r.errors.every((e) => e.type === c.errorType)).toBe(true);
  });
});