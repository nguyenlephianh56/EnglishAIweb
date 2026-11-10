import { describe, it, expect } from "vitest";
import { gradeFillBlank } from "./fillBlank.grader";
import { gradeListeningFill } from "./listeningFill.grader";
import { gradeExercise } from "../gradeExercise";
import type { GradeResult } from "../types";

// fill_blank và listening_fill chỉ dùng `answer`, nên content để object rỗng.
const CONTENT = { text: "He ___ to school.", hint: "go" };
const grade = (answer: string[], student: (string | null)[]) =>
  gradeFillBlank(CONTENT, answer, student);

/** correct/total/errors phải khớp nhau và khớp score. */
function expectConsistent(result: GradeResult, total: number) {
  expect(result.total).toBe(total);
  expect(result.maxScore).toBe(10);
  expect(result.errors).toHaveLength(total - result.correct);
  expect(result.score).toBe(Math.round((result.correct / total) * 1000) / 100);
}

describe("gradeFillBlank - điểm", () => {
  it("đúng hết -> 10, không có lỗi", () => {
    const r = grade(["goes", "to", "school"], ["goes", "to", "school"]);
    expect(r).toEqual({ score: 10, maxScore: 10, correct: 3, total: 3, errors: [] });
  });

  it("sai hết -> 0", () => {
    const r = grade(["goes", "to", "school"], ["go", "at", "home"]);
    expect(r.score).toBe(0);
    expect(r.correct).toBe(0);
    expectConsistent(r, 3);
  });

  it("đúng 2/3 -> 6.67", () => {
    const r = grade(["a", "b", "c"], ["a", "b", "x"]);
    expect(r.score).toBe(6.67);
    expect(r.correct).toBe(2);
    expectConsistent(r, 3);
  });

  it("đúng 1/3 -> 3.33; 1/2 -> 5", () => {
    expect(grade(["a", "b", "c"], ["a", "x", "y"]).score).toBe(3.33);
    expect(grade(["a", "b"], ["a", "x"]).score).toBe(5);
  });

  it("chỉ 1 chỗ trống: đúng 10, sai 0", () => {
    expect(grade(["goes"], ["goes"]).score).toBe(10);
    expect(grade(["goes"], ["go"]).score).toBe(0);
  });
});

describe("gradeFillBlank - so khớp chuỗi", () => {
  it.each(["Goes", "  goes  ", "GOES", "gOeS", "\tgoes\n"])(
    "%j đúng",
    (student) => {
      expect(grade(["goes"], [student]).score).toBe(10);
    }
  );

  it("đáp án GV viết hoa vẫn khớp bài làm viết thường", () => {
    expect(grade(["Goes"], ["goes"]).score).toBe(10);
  });

  it("\"go\" sai", () => {
    expect(grade(["goes"], ["go"]).score).toBe(0);
  });

  it("chuỗi chỉ toàn khoảng trắng sai", () => {
    const r = grade(["goes"], ["   "]);
    expect(r.score).toBe(0);
    expect(r.errors[0].text).toBe("");
  });

  it("gộp nhiều khoảng trắng ở giữa", () => {
    expect(grade(["went to"], ["went    to"]).score).toBe(10);
    expect(grade(["went to"], [" Went \t TO "]).score).toBe(10);
  });

  it("không bỏ dấu câu cuối: \"goes.\" sai", () => {
    expect(grade(["goes"], ["goes."]).score).toBe(0);
  });

  it("\"|\" không phải dấu nhiều đáp án: so như ký tự thường", () => {
    expect(grade(["color|colour"], ["colour"]).score).toBe(0);
    expect(grade(["color|colour"], ["color|colour"]).score).toBe(10);
  });
});

describe("gradeFillBlank - bỏ trống, thiếu, thừa (không bao giờ ném lỗi)", () => {
  it("null và \"\" tính sai", () => {
    const r = grade(["a", "b", "c"], [null, "", "c"]);
    expect(r.score).toBe(3.33);
    expect(r.errors).toEqual([
      { type: "foundation:wrong_blank", text: "", correction: "a" },
      { type: "foundation:wrong_blank", text: "", correction: "b" },
    ]);
  });

  it("bài làm thiếu phần tử: phần thiếu tính sai", () => {
    expect(grade(["a", "b"], ["a"]).score).toBe(5);
    const empty = grade(["a", "b"], []);
    expect(empty.score).toBe(0);
    expectConsistent(empty, 2);
  });

  it("bài làm thừa phần tử: bỏ qua phần thừa", () => {
    const r = grade(["a"], ["a", "b", "c"]);
    expect(r).toEqual({ score: 10, maxScore: 10, correct: 1, total: 1, errors: [] });
  });

  it("dữ liệu lạ (không phải chuỗi, không phải mảng) -> sai, không lỗi", () => {
    expect(() => grade(["a"], [5 as unknown as string])).not.toThrow();
    expect(grade(["a"], [5 as unknown as string]).score).toBe(0);
    expect(() =>
      gradeFillBlank(CONTENT, ["a"], undefined as unknown as string[])
    ).not.toThrow();
    expect(gradeFillBlank(CONTENT, ["a"], null as unknown as string[]).score).toBe(0);
  });

  it("answer rỗng -> điểm 0, không chia cho 0", () => {
    const r = grade([], []);
    expect(r).toEqual({ score: 0, maxScore: 10, correct: 0, total: 0, errors: [] });
  });
});

describe("gradeFillBlank - errors[]", () => {
  it("đúng số lượng, type, text, correction", () => {
    const r = grade(["goes", "to"], ["  go ", "to"]);
    expect(r.errors).toEqual([
      { type: "foundation:wrong_blank", text: "go", correction: "goes" },
    ]);
    expectConsistent(r, 2);
  });

  it("text là bài làm của HS (giữ nguyên hoa/thường, chỉ trim)", () => {
    const r = grade(["goes"], ["  GO  "]);
    expect(r.errors[0].text).toBe("GO");
    expect(r.errors[0].correction).toBe("goes");
  });

  it("correction giữ nguyên đáp án của GV", () => {
    expect(grade(["Goes"], ["x"]).errors[0].correction).toBe("Goes");
  });

  it("mỗi chỗ sai đúng 1 lỗi, theo thứ tự chỗ trống", () => {
    const r = grade(["a", "b", "c", "d"], ["x", "b", "y", "d"]);
    expect(r.errors.map((e) => e.correction)).toEqual(["a", "c"]);
    expectConsistent(r, 4);
  });
});

describe("gradeListeningFill - cùng cách chấm, khác type", () => {
  const listening = (answer: string[], student: (string | null)[]) =>
    gradeListeningFill({ script: "He goes to school.", blanks: answer.length }, answer, student);

  it("chấm giống fill_blank", () => {
    expect(listening(["goes"], [" GOES "]).score).toBe(10);
    expect(listening(["a", "b", "c"], ["a", "b", "x"]).score).toBe(6.67);
    expect(listening(["a", "b"], []).score).toBe(0);
  });

  it("errors[].type = listening:wrong_blank", () => {
    const r = listening(["a", "b"], ["a", "z"]);
    expect(r.errors).toEqual([
      { type: "listening:wrong_blank", text: "z", correction: "b" },
    ]);
  });
});

describe("qua gradeExercise + registry (hàm thật)", () => {
  it("fill_blank -> hàm thật, điểm và lỗi đúng", () => {
    const r = gradeExercise("fill_blank", CONTENT, ["goes", "to"], ["GOES", "at"]);
    expect(r.score).toBe(5);
    expect(r.errors).toEqual([
      { type: "foundation:wrong_blank", text: "at", correction: "to" },
    ]);
  });

  it("listening_fill -> hàm thật với type riêng", () => {
    const r = gradeExercise("listening_fill", {}, ["a", "b"], ["a", null]);
    expect(r.score).toBe(5);
    expect(r.errors).toEqual([
      { type: "listening:wrong_blank", text: "", correction: "b" },
    ]);
  });

  it("bỏ trống bằng null/\"\" qua gradeExercise: tính sai, không lỗi", () => {
    const r = gradeExercise("fill_blank", CONTENT, ["a", "b"], [null, ""]);
    expect(r.score).toBe(0);
    expect(r.errors).toHaveLength(2);
  });

  it("thiếu phần tử qua gradeExercise: 400 (hành vi parse đã chốt từ trước)", () => {
    expect(() => gradeExercise("fill_blank", CONTENT, ["a", "b"], ["a"])).toThrow(
      /Bài làm không hợp lệ/
    );
  });
});
