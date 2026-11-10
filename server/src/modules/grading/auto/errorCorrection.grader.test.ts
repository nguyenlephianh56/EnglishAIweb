import { describe, it, expect } from "vitest";
import { gradeErrorCorrection } from "./errorCorrection.grader";
import { gradeExercise } from "../gradeExercise";

const CONTENT = { sentence: "She go to school every day.", wrong: "go" };
const grade = (student: unknown, answer = ["goes"]) =>
  gradeErrorCorrection(CONTENT, answer, student as (string | null)[]);

describe("gradeErrorCorrection - điểm (chỉ 10 hoặc 0)", () => {
  it("đúng -> 10, không có lỗi", () => {
    expect(grade(["goes"])).toEqual({
      score: 10,
      maxScore: 10,
      correct: 1,
      total: 1,
      errors: [],
    });
  });

  it("sai -> 0", () => {
    const r = grade(["went"]);
    expect(r.score).toBe(0);
    expect(r.correct).toBe(0);
    expect(r.total).toBe(1);
  });

  it.each(["Goes", "  goes  ", "GOES", "\tgoes\n"])(
    "%j đúng (không phân biệt hoa/thường, trim)",
    (student) => {
      expect(grade([student]).score).toBe(10);
    }
  );

  it("đáp án nhiều từ: gộp khoảng trắng giữa", () => {
    expect(grade(["has   gone"], ["has gone"]).score).toBe(10);
    expect(grade([" HAS gone "], ["has gone"]).score).toBe(10);
  });

  it("\"go\" và \"goes.\" sai", () => {
    expect(grade(["go"]).score).toBe(0);
    expect(grade(["goes."]).score).toBe(0);
  });
});

describe("gradeErrorCorrection - bỏ trống, thiếu, thừa (không bao giờ ném lỗi)", () => {
  it.each([[null], [""], ["   "], [[]]])("bỏ trống %j tính sai", (student) => {
    const input = Array.isArray(student) ? student : [student];
    const r = grade(input);
    expect(r.score).toBe(0);
    expect(r.errors).toEqual([
      { type: "writing:wrong_correction", text: "", correction: "goes" },
    ]);
  });

  it("bài làm thiếu phần tử (mảng rỗng) hoặc không phải mảng -> sai, không lỗi", () => {
    expect(grade([]).score).toBe(0);
    expect(grade(null).score).toBe(0);
    expect(grade(undefined).total).toBe(1);
  });

  it("bài làm thừa phần tử: chỉ xét phần tử đầu", () => {
    expect(grade(["goes", "x"]).score).toBe(10);
    expect(grade(["x", "goes"]).score).toBe(0);
  });

  it("giá trị lạ (số, object) -> sai, không lỗi", () => {
    expect(grade([5]).score).toBe(0);
    expect(grade([{}]).score).toBe(0);
  });

  it("answer có hơn 1 phần tử (dữ liệu hỏng): vẫn chỉ tính 1 câu", () => {
    const r = grade(["goes"], ["goes", "extra"]);
    expect(r.total).toBe(1);
    expect(r.score).toBe(10);
  });

  it("answer rỗng (dữ liệu hỏng) -> điểm 0, không chia cho 0", () => {
    expect(grade(["x"], [])).toEqual({
      score: 0,
      maxScore: 10,
      correct: 0,
      total: 0,
      errors: [],
    });
  });
});

describe("gradeErrorCorrection - errors[]", () => {
  it("1 lỗi: đúng type, text là bản sửa của HS (trim), correction là answer[0]", () => {
    const r = grade(["  Went "]);
    expect(r.errors).toEqual([
      { type: "writing:wrong_correction", text: "Went", correction: "goes" },
    ]);
  });

  it("correct/total khớp score và số lỗi", () => {
    const ok = grade(["goes"]);
    expect(ok.errors).toHaveLength(ok.total - ok.correct);
    const bad = grade(["x"]);
    expect(bad.errors).toHaveLength(bad.total - bad.correct);
    expect(bad.score).toBe(0);
  });

  it("correction giữ nguyên đáp án của GV (không hạ chữ thường)", () => {
    expect(grade(["x"], ["Goes"]).errors[0].correction).toBe("Goes");
  });
});

describe("qua gradeExercise + registry (hàm thật)", () => {
  it("error_correction -> hàm thật, đúng 10 / sai 0 kèm lỗi", () => {
    expect(gradeExercise("error_correction", CONTENT, ["goes"], [" GOES "]).score).toBe(10);
    const r = gradeExercise("error_correction", CONTENT, ["goes"], ["went"]);
    expect(r.score).toBe(0);
    expect(r.errors).toEqual([
      { type: "writing:wrong_correction", text: "went", correction: "goes" },
    ]);
  });

  it("bỏ trống null qua gradeExercise: tính sai, không lỗi", () => {
    const r = gradeExercise("error_correction", CONTENT, ["goes"], [null]);
    expect(r.score).toBe(0);
    expect(r.errors).toHaveLength(1);
  });

  it("thiếu hoặc thừa phần tử qua gradeExercise: 400 (parse đã chốt từ trước)", () => {
    expect(() => gradeExercise("error_correction", CONTENT, ["goes"], [])).toThrow(
      /Bài làm không hợp lệ/
    );
    expect(() =>
      gradeExercise("error_correction", CONTENT, ["goes"], ["goes", "x"])
    ).toThrow(/Bài làm không hợp lệ/);
  });
});