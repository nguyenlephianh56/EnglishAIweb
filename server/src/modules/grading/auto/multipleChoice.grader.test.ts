import { describe, it, expect } from "vitest";
import { gradeMultipleChoice } from "./multipleChoice.grader";
import { gradeExercise } from "../gradeExercise";
import type { MultipleChoiceContent } from "../../exercises/exercise-content.schema";
import type { GradeResult } from "../types";

// 3 câu, mỗi câu 3 lựa chọn. Đáp án đúng: [1, 0, 2] = "goes", "an", "at".
const CONTENT: MultipleChoiceContent = {
  passage: "Short passage.",
  questions: [
    { q: "He ___ to school.", options: ["go", "goes", "going"] },
    { q: "She has ___ apple.", options: ["an", "a", "the"] },
    { q: "We arrive ___ 8 o'clock.", options: ["in", "on", "at"] },
  ],
};
const ANSWER = [1, 0, 2];

const grade = (student: (number | null)[], answer = ANSWER, content = CONTENT) =>
  gradeMultipleChoice(content, answer, student);

/** correct/total/errors phải khớp nhau và khớp score. */
function expectConsistent(result: GradeResult, total: number) {
  expect(result.total).toBe(total);
  expect(result.maxScore).toBe(10);
  expect(result.errors).toHaveLength(total - result.correct);
  expect(result.score).toBe(Math.round((result.correct / total) * 1000) / 100);
}

describe("gradeMultipleChoice - điểm", () => {
  it("đúng hết -> 10, không có lỗi", () => {
    expect(grade([1, 0, 2])).toEqual({
      score: 10,
      maxScore: 10,
      correct: 3,
      total: 3,
      errors: [],
    });
  });

  it("sai hết -> 0", () => {
    const r = grade([0, 1, 0]);
    expect(r.score).toBe(0);
    expect(r.correct).toBe(0);
    expectConsistent(r, 3);
  });

  it("đúng 2/3 -> 6.67", () => {
    const r = grade([1, 0, 0]);
    expect(r.score).toBe(6.67);
    expect(r.correct).toBe(2);
    expectConsistent(r, 3);
  });

  it("đúng 1/3 -> 3.33", () => {
    expect(grade([1, 1, 1]).score).toBe(3.33);
  });

  it("bài chỉ có 1 câu: đúng 10, sai 0", () => {
    const content: MultipleChoiceContent = {
      questions: [{ q: "2 + 2 = ?", options: ["3", "4"] }],
    };
    expect(grade([1], [1], content).score).toBe(10);
    expect(grade([0], [1], content).score).toBe(0);
  });

  it("đáp án đúng là vị trí 0 vẫn chấm đúng (không nhầm với bỏ trống)", () => {
    expect(grade([null, 0, 2]).correct).toBe(2);
    expect(grade([null, 0, 2]).errors).toHaveLength(1);
  });
});

describe("gradeMultipleChoice - bỏ trống, thiếu, thừa, giá trị lạ (không bao giờ ném lỗi)", () => {
  it("null tính sai", () => {
    const r = grade([null, null, null]);
    expect(r.score).toBe(0);
    expect(r.errors).toHaveLength(3);
    expect(r.errors.every((e) => e.text === "")).toBe(true);
    expectConsistent(r, 3);
  });

  it("thiếu phần tử: phần thiếu tính sai", () => {
    expect(grade([1]).score).toBe(3.33);
    const empty = grade([]);
    expect(empty.score).toBe(0);
    expectConsistent(empty, 3);
  });

  it("thừa phần tử: bỏ qua phần thừa", () => {
    expect(grade([1, 0, 2, 1, 1]).score).toBe(10);
  });

  it("chỉ số ngoài phạm vi (vượt số lựa chọn) tính sai, text rỗng", () => {
    const r = grade([9, 0, 2]);
    expect(r.score).toBe(6.67);
    expect(r.errors).toEqual([
      { type: "reading:wrong_choice", text: "", correction: "goes" },
    ]);
  });

  it("giá trị lạ (âm, số thập phân, chuỗi, undefined) tính sai, không lỗi", () => {
    const weird = [-1, 1.5, "1", undefined] as unknown as (number | null)[];
    for (const value of weird) {
      expect(() => grade([value, 0, 2])).not.toThrow();
      expect(grade([value, 0, 2]).correct).toBe(2);
    }
  });

  it("bài làm không phải mảng -> sai hết, không lỗi", () => {
    const r = gradeMultipleChoice(CONTENT, ANSWER, null as unknown as number[]);
    expect(r.score).toBe(0);
    expect(r.errors).toHaveLength(3);
  });

  it("answer rỗng -> điểm 0, không chia cho 0", () => {
    expect(grade([], [])).toEqual({
      score: 0,
      maxScore: 10,
      correct: 0,
      total: 0,
      errors: [],
    });
  });
});

describe("gradeMultipleChoice - errors[]", () => {
  it("text = chữ lựa chọn HS chọn, correction = chữ lựa chọn đúng", () => {
    const r = grade([0, 0, 1]);
    expect(r.errors).toEqual([
      { type: "reading:wrong_choice", text: "go", correction: "goes" },
      { type: "reading:wrong_choice", text: "on", correction: "at" },
    ]);
  });

  it("đúng số lượng, theo thứ tự câu", () => {
    const r = grade([0, 0, 2]);
    expect(r.errors.map((e) => e.correction)).toEqual(["goes"]);
    const all = grade([0, 1, 0]);
    expect(all.errors.map((e) => e.correction)).toEqual(["goes", "an", "at"]);
    expectConsistent(all, 3);
  });

  it("câu bỏ trống: text rỗng, correction vẫn là chữ", () => {
    expect(grade([null, 0, 2]).errors).toEqual([
      { type: "reading:wrong_choice", text: "", correction: "goes" },
    ]);
  });

  it("content hỏng (thiếu câu hỏi): không ném lỗi, correction là chỉ số dạng chuỗi", () => {
    const broken = { questions: [] } as unknown as MultipleChoiceContent;
    const r = grade([0, 0, 0], ANSWER, broken);
    expect(r.errors[0]).toEqual({
      type: "reading:wrong_choice",
      text: "",
      correction: "1",
    });
  });
});

describe("qua gradeExercise + registry (hàm thật)", () => {
  it("multiple_choice -> hàm thật, điểm và lỗi đúng", () => {
    const r = gradeExercise("multiple_choice", CONTENT, ANSWER, [1, 2, 2]);
    expect(r.score).toBe(6.67);
    expect(r.errors).toEqual([
      { type: "reading:wrong_choice", text: "the", correction: "an" },
    ]);
  });

  it("bỏ trống null qua gradeExercise: tính sai, không lỗi", () => {
    const r = gradeExercise("multiple_choice", CONTENT, ANSWER, [null, null, null]);
    expect(r.score).toBe(0);
    expect(r.errors).toHaveLength(3);
  });

  it("chỉ số ngoài phạm vi qua gradeExercise: tính sai (parse không biết số lựa chọn)", () => {
    const r = gradeExercise("multiple_choice", CONTENT, ANSWER, [1, 0, 7]);
    expect(r.score).toBe(6.67);
    expect(r.errors[0].text).toBe("");
  });

  it("thiếu phần tử hoặc chỉ số âm qua gradeExercise: 400 (parse đã chốt từ trước)", () => {
    expect(() => gradeExercise("multiple_choice", CONTENT, ANSWER, [1, 0])).toThrow(
      /Bài làm không hợp lệ/
    );
    expect(() => gradeExercise("multiple_choice", CONTENT, ANSWER, [1, 0, -1])).toThrow(
      /Bài làm không hợp lệ/
    );
  });
});