import { describe, it, expect } from "vitest";
import { gradeMatching } from "./matching.grader";
import { gradeExercise } from "../gradeExercise";
import type { GradeResult } from "../types";

// 3 cặp. Đáp án (đã xáo trộn): cat->"con mèo", dog->"con chó", bird->"con chim".
const CONTENT = {
  left: ["cat", "dog", "bird"],
  right: ["con chim", "con mèo", "con chó"],
};
const ANSWER: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 0],
];

/** HS nộp tuỳ ý (kể cả dữ liệu lạ), nên nhận unknown rồi ép kiểu một chỗ. */
const grade = (student: unknown, answer = ANSWER, content = CONTENT) =>
  gradeMatching(content, answer, student as [number, number][]);

/** correct/total/errors phải khớp nhau và khớp score. */
function expectConsistent(result: GradeResult, total: number) {
  expect(result.total).toBe(total);
  expect(result.maxScore).toBe(10);
  expect(result.errors).toHaveLength(total - result.correct);
  expect(result.score).toBe(Math.round((result.correct / total) * 1000) / 100);
}

describe("gradeMatching - điểm", () => {
  it("đúng hết -> 10, không có lỗi", () => {
    expect(grade([[0, 1], [1, 2], [2, 0]])).toEqual({
      score: 10,
      maxScore: 10,
      correct: 3,
      total: 3,
      errors: [],
    });
  });

  it("đúng khi HS nộp các cặp theo thứ tự khác", () => {
    expect(grade([[2, 0], [0, 1], [1, 2]]).score).toBe(10);
    expect(grade([[1, 2], [2, 0], [0, 1]]).errors).toEqual([]);
  });

  it("sai hết -> 0", () => {
    const r = grade([[0, 0], [1, 1], [2, 2]]);
    expect(r.score).toBe(0);
    expect(r.correct).toBe(0);
    expectConsistent(r, 3);
  });

  it("đúng 2/3 (thiếu 1 cặp) -> 6.67", () => {
    const r = grade([[0, 1], [1, 2]]);
    expect(r.score).toBe(6.67);
    expect(r.correct).toBe(2);
    expectConsistent(r, 3);
  });

  it("đúng 2/3 (1 cặp nối sai) -> 6.67", () => {
    // right 1 bị dùng hai lần: hợp lệ khi gọi trực tiếp, parse sẽ chặn ở gradeExercise
    const r = grade([[0, 1], [1, 2], [2, 1]]);
    expect(r.score).toBe(6.67);
    expectConsistent(r, 3);
  });

  it("đúng 1/3 -> 3.33", () => {
    expect(grade([[0, 1]]).score).toBe(3.33);
    expect(grade([[0, 1], [1, 0], [2, 2]]).score).toBe(3.33);
  });

  it("2 cặp: đúng 1 -> 5", () => {
    const content = { left: ["a", "b"], right: ["x", "y"] };
    expect(grade([[0, 0]], [[0, 0], [1, 1]], content).score).toBe(5);
  });
});

describe("gradeMatching - chưa nối, thiếu, giá trị lạ (không bao giờ ném lỗi)", () => {
  it("không nối cặp nào -> 0, mỗi cặp một lỗi 'left → '", () => {
    const r = grade([]);
    expect(r.score).toBe(0);
    expect(r.errors.map((e) => e.text)).toEqual(["cat → ", "dog → ", "bird → "]);
    expectConsistent(r, 3);
  });

  it("bài làm không phải mảng -> sai hết, không lỗi", () => {
    expect(grade(null).score).toBe(0);
    expect(grade(undefined).errors).toHaveLength(3);
    expect(grade("abc").correct).toBe(0);
  });

  it("phần tử lạ (không phải cặp, âm, số thập phân, chuỗi, ngoài phạm vi) bị bỏ qua", () => {
    const weird = [
      null,
      "x",
      [0],
      [0, 1, 2],
      [-1, 1],
      [0.5, 1],
      ["0", "1"],
      [9, 1], // left ngoài phạm vi
    ];
    expect(() => grade(weird)).not.toThrow();
    expect(grade(weird).score).toBe(0);
    // lẫn một cặp đúng vẫn được tính
    expect(grade([...weird, [1, 2]]).correct).toBe(1);
  });

  it("right ngoài phạm vi tính sai, text không có vế phải", () => {
    const r = grade([[0, 9], [1, 2], [2, 0]]);
    expect(r.score).toBe(6.67);
    expect(r.errors).toEqual([
      { type: "foundation:wrong_match", text: "cat → ", correction: "cat → con mèo" },
    ]);
  });

  it("answer rỗng -> điểm 0, không chia cho 0", () => {
    expect(grade([[0, 0]], [])).toEqual({
      score: 0,
      maxScore: 10,
      correct: 0,
      total: 0,
      errors: [],
    });
  });
});

describe("gradeMatching - cặp trùng chỉ số left chỉ tính một lần", () => {
  it("cặp trùng hệt nhau chỉ tính 1, điểm không vượt 10", () => {
    const r = grade([[0, 1], [0, 1], [0, 1], [1, 2], [2, 0]]);
    expect(r.correct).toBe(3);
    expect(r.score).toBe(10);
    expectConsistent(r, 3);
  });

  it("left trùng: lấy cặp đầu tiên, cặp sau bị bỏ qua", () => {
    // cặp đầu của left 0 là [0,0] (sai), [0,1] đúng nhưng đến sau nên không tính
    const wrongFirst = grade([[0, 0], [0, 1], [1, 2], [2, 0]]);
    expect(wrongFirst.correct).toBe(2);
    expect(wrongFirst.score).toBe(6.67);
    // cặp đầu đúng thì left đó đúng
    const rightFirst = grade([[0, 1], [0, 0], [1, 2], [2, 0]]);
    expect(rightFirst.correct).toBe(3);
    expect(rightFirst.score).toBe(10);
  });

  it("không thể ăn điểm bằng cách nối một left với mọi right", () => {
    const r = grade([[0, 0], [0, 1], [0, 2]]);
    expect(r.correct).toBe(0);
    expect(r.score).toBe(0);
  });
});

describe("gradeMatching - errors[]", () => {
  it("cặp sai: text = left → right HS nối, correction = left → right đúng", () => {
    const r = grade([[0, 1], [1, 0], [2, 2]]);
    expect(r.errors).toEqual([
      { type: "foundation:wrong_match", text: "dog → con chim", correction: "dog → con chó" },
      { type: "foundation:wrong_match", text: "bird → con chó", correction: "bird → con chim" },
    ]);
    expectConsistent(r, 3);
  });

  it("cặp chưa nối: text chỉ có vế trái", () => {
    expect(grade([[0, 1], [1, 2]]).errors).toEqual([
      { type: "foundation:wrong_match", text: "bird → ", correction: "bird → con chim" },
    ]);
  });

  it("đúng số lượng lỗi, theo thứ tự answer (không theo thứ tự HS nộp)", () => {
    const r = grade([[2, 2], [1, 1], [0, 0]]);
    expect(r.errors.map((e) => e.correction)).toEqual([
      "cat → con mèo",
      "dog → con chó",
      "bird → con chim",
    ]);
    expectConsistent(r, 3);
  });

  it("content hỏng (thiếu cột): không ném lỗi, dùng chỉ số dạng chuỗi", () => {
    const r = grade([], ANSWER, {} as unknown as typeof CONTENT);
    expect(r.errors[0]).toEqual({
      type: "foundation:wrong_match",
      text: "0 → ",
      correction: "0 → 1",
    });
  });
});

describe("qua gradeExercise + registry (hàm thật)", () => {
  it("matching -> hàm thật, điểm và lỗi đúng", () => {
    // cat đúng; dog và bird nối chéo nhau (mỗi cột phải dùng một lần nên hợp lệ)
    const r = gradeExercise("matching", CONTENT, ANSWER, [[0, 1], [1, 0], [2, 2]]);
    expect(r.score).toBe(3.33);
    expect(r.errors).toEqual([
      { type: "foundation:wrong_match", text: "dog → con chim", correction: "dog → con chó" },
      { type: "foundation:wrong_match", text: "bird → con chó", correction: "bird → con chim" },
    ]);
  });

  it("thiếu cặp hoặc không nối gì qua gradeExercise: tính sai, không lỗi", () => {
    expect(gradeExercise("matching", CONTENT, ANSWER, [[0, 1]]).score).toBe(3.33);
    const none = gradeExercise("matching", CONTENT, ANSWER, []);
    expect(none.score).toBe(0);
    expect(none.errors).toHaveLength(3);
  });

  it("trùng left, trùng right hoặc left ngoài phạm vi qua gradeExercise: 400 (parse đã chốt từ trước)", () => {
    expect(() =>
      gradeExercise("matching", CONTENT, ANSWER, [[0, 1], [0, 2]])
    ).toThrow(/Bài làm không hợp lệ/);
    expect(() =>
      gradeExercise("matching", CONTENT, ANSWER, [[0, 1], [1, 1]])
    ).toThrow(/Bài làm không hợp lệ/);
    expect(() => gradeExercise("matching", CONTENT, ANSWER, [[9, 1]])).toThrow(
      /Bài làm không hợp lệ/
    );
  });
});