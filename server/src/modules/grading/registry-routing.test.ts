import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Kiểm registry định tuyến đúng hàm chấm: thay 5 hàm chấm bằng mock, mỗi mock
 * trả một điểm riêng (1..5) để biết hàm nào được gọi.
 * File này tách riêng vì vi.mock áp dụng cho cả file.
 */
const mocks = vi.hoisted(() => {
  const make = (score: number) =>
    vi.fn(() => ({ score, maxScore: 10 as const, correct: score, total: 10, errors: [] }));
  return {
    multipleChoice: make(1),
    fillBlank: make(2),
    matching: make(3),
    errorCorrection: make(4),
    listeningFill: make(5),
  };
});

vi.mock("./auto/multipleChoice.grader", () => ({
  gradeMultipleChoice: mocks.multipleChoice,
}));
vi.mock("./auto/fillBlank.grader", () => ({ gradeFillBlank: mocks.fillBlank }));
vi.mock("./auto/listeningFill.grader", () => ({
  gradeListeningFill: mocks.listeningFill,
}));
vi.mock("./auto/matching.grader", () => ({ gradeMatching: mocks.matching }));
vi.mock("./auto/errorCorrection.grader", () => ({
  gradeErrorCorrection: mocks.errorCorrection,
}));

import { gradeExercise } from "./gradeExercise";

type MockName = keyof typeof mocks;

const CASES: {
  type: string;
  expected: MockName;
  score: number;
  answer: unknown[];
  student: unknown[];
}[] = [
  { type: "multiple_choice", expected: "multipleChoice", score: 1, answer: [1, 0], student: [1, null] },
  { type: "fill_blank", expected: "fillBlank", score: 2, answer: ["goes"], student: ["goes"] },
  { type: "matching", expected: "matching", score: 3, answer: [[0, 0], [1, 1]], student: [[0, 0]] },
  { type: "error_correction", expected: "errorCorrection", score: 4, answer: ["goes"], student: ["go"] },
  // listening_fill có hàm chấm riêng (cùng logic với fill_blank, khác errors[].type)
  { type: "listening_fill", expected: "listeningFill", score: 5, answer: ["a", "b"], student: ["a", ""] },
];

describe("registry định tuyến đúng hàm chấm", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockClear());
  });

  it.each(CASES)(
    "$type -> $expected",
    ({ type, expected, score, answer, student }) => {
      const content = { chỉ: "để kiểm" };
      const result = gradeExercise(type, content, answer, student);

      // trả kết quả của đúng hàm chấm
      expect(result.score).toBe(score);

      // chỉ hàm đó được gọi, đúng 1 lần, với đúng (content, answer, studentAnswer)
      for (const name of Object.keys(mocks) as MockName[]) {
        expect(mocks[name]).toHaveBeenCalledTimes(name === expected ? 1 : 0);
      }
      expect(mocks[expected]).toHaveBeenCalledWith(content, answer, student);
    }
  );

  it("dạng không chấm tự động không gọi hàm chấm nào", () => {
    for (const type of ["writing", "speaking", "abc"]) {
      expect(() => gradeExercise(type, {}, null, [])).toThrow(/không chấm tự động/);
    }
    Object.values(mocks).forEach((mock) => expect(mock).not.toHaveBeenCalled());
  });

  it("bài làm sai hình dạng không gọi hàm chấm nào", () => {
    expect(() => gradeExercise("multiple_choice", {}, [1, 0], [1])).toThrow(
      /Bài làm không hợp lệ/
    );
    Object.values(mocks).forEach((mock) => expect(mock).not.toHaveBeenCalled());
  });
});