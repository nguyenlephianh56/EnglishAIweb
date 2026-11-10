import { describe, it, expect, vi, afterEach } from "vitest";
import {
  gradeExercise,
  round2,
  NOT_AUTO_GRADABLE_CODE,
  NOT_AUTO_GRADABLE_STATUS,
  INVALID_STUDENT_ANSWER_CODE,
  INVALID_STUDENT_ANSWER_STATUS,
  INVALID_EXERCISE_DATA_CODE,
} from "./gradeExercise";
import {
  registerGrader,
  unregisterGrader,
  getGrader,
  type AnyRegistryEntry,
} from "./registry";
import { AUTO_GRADED_TYPES, type GradeResult } from "./types";

/** Chạy fn, bắt lỗi và kiểm statusCode, code, nội dung message. */
function expectGradingError(
  fn: () => unknown,
  statusCode: number,
  code: string,
  message: RegExp
) {
  let caught: (Error & { statusCode?: number; code?: string }) | undefined;
  try {
    fn();
  } catch (error) {
    caught = error as Error & { statusCode?: number; code?: string };
  }
  expect(caught, "phải ném lỗi").toBeDefined();
  expect(caught!.statusCode).toBe(statusCode);
  expect(caught!.code).toBe(code);
  expect(caught!.message).toMatch(message);
}

const expectNotAutoGradable = (type: unknown) =>
  expectGradingError(
    () => gradeExercise(type, {}, [], []),
    NOT_AUTO_GRADABLE_STATUS,
    NOT_AUTO_GRADABLE_CODE,
    /không chấm tự động/
  );

const expectInvalidStudentAnswer = (
  type: string,
  answer: unknown,
  student: unknown
) =>
  expectGradingError(
    () => gradeExercise(type, {}, answer, student),
    INVALID_STUDENT_ANSWER_STATUS,
    INVALID_STUDENT_ANSWER_CODE,
    /^Bài làm không hợp lệ: /
  );

/** Bộ dữ liệu hợp lệ cho từng dạng tự động: [type, answer GV, studentAnswer]. */
const VALID_CASES: [string, unknown[], unknown[]][] = [
  ["multiple_choice", [1, 0], [1, 0]],
  ["fill_blank", ["goes"], ["goes"]],
  ["matching", [[0, 0], [1, 1]], [[0, 0], [1, 1]]],
  ["error_correction", ["goes"], ["goes"]],
  ["listening_fill", ["a", "b"], ["a", "b"]],
];

function expectValidGradeResult(result: GradeResult, total: number) {
  expect(Object.keys(result).sort()).toEqual(
    ["correct", "errors", "maxScore", "score", "total"].sort()
  );
  expect(result.maxScore).toBe(10);
  expect(result.score).toBeGreaterThanOrEqual(0);
  expect(result.score).toBeLessThanOrEqual(10);
  expect(Number.isInteger(result.correct)).toBe(true);
  expect(result.total).toBe(total);
  expect(Array.isArray(result.errors)).toBe(true);
}

describe("gradeExercise - dạng không chấm tự động", () => {
  it.each([
    "writing",
    "speaking",
    "abc",
    "",
    "MULTIPLE_CHOICE", // phân biệt hoa/thường
    "__proto__",
    "constructor",
    "toString",
  ])("type %j -> 422 NOT_AUTO_GRADABLE", (type) => {
    expectNotAutoGradable(type);
  });

  it.each([undefined, null, 123, {}, [], true])(
    "type không phải chuỗi (%j) -> 422 NOT_AUTO_GRADABLE",
    (type) => {
      expectNotAutoGradable(type);
    }
  );

  it("message có tên dạng bài (cắt ngắn nếu quá dài)", () => {
    expectGradingError(
      () => gradeExercise("writing", {}, null, { text: "x" }),
      422,
      NOT_AUTO_GRADABLE_CODE,
      /dạng: writing/
    );
    const long = "x".repeat(500);
    try {
      gradeExercise(long, {}, [], []);
    } catch (error) {
      expect((error as Error).message.length).toBeLessThan(120);
    }
  });

  it("writing/speaking không có trong registry", () => {
    expect(getGrader("writing")).toBeUndefined();
    expect(getGrader("speaking")).toBeUndefined();
  });
});

describe("gradeExercise - 5 dạng tự động đều có trong registry", () => {
  it.each([...AUTO_GRADED_TYPES])("%s đã đăng ký", (type) => {
    expect(getGrader(type)).toBeDefined();
  });
});

describe("gradeExercise - bài làm hợp lệ trả GradeResult đủ field", () => {
  it.each(VALID_CASES)("%s", (type, answer, student) => {
    const result = gradeExercise(type, {}, answer, student);
    expectValidGradeResult(result, answer.length);
  });

  it("cho phép bỏ trống: null hoặc chuỗi rỗng", () => {
    expectValidGradeResult(
      gradeExercise("multiple_choice", {}, [1, 0, 2], [null, 0, null]),
      3
    );
    expectValidGradeResult(
      gradeExercise("fill_blank", {}, ["a", "b", "c"], [null, "", "c"]),
      3
    );
    expectValidGradeResult(
      gradeExercise("listening_fill", {}, ["a", "b"], ["", null]),
      2
    );
    expectValidGradeResult(
      gradeExercise("error_correction", {}, ["goes"], [null]),
      1
    );
  });

  it("matching cho phép nối 0..n cặp (chưa nối = bỏ trống)", () => {
    const answer = [[0, 0], [1, 1], [2, 2]];
    expectValidGradeResult(gradeExercise("matching", {}, answer, []), 3);
    expectValidGradeResult(gradeExercise("matching", {}, answer, [[2, 0]]), 3);
    expectValidGradeResult(
      gradeExercise("matching", {}, answer, [[2, 0], [0, 2], [1, 1]]),
      3
    );
  });

  it("câu trả lời đúng giới hạn 500 ký tự vẫn hợp lệ", () => {
    expectValidGradeResult(
      gradeExercise("fill_blank", {}, ["a"], ["x".repeat(500)]),
      1
    );
  });
});

describe("gradeExercise - bài làm sai hình dạng -> 400 tiếng Việt", () => {
  it("không phải mảng (undefined, null, chuỗi, số, object)", () => {
    for (const type of AUTO_GRADED_TYPES) {
      for (const bad of [undefined, null, "goes", 5, { 0: "a" }]) {
        expectInvalidStudentAnswer(type, ["x"], bad);
      }
    }
  });

  it("sai độ dài (thiếu / thừa)", () => {
    expectInvalidStudentAnswer("multiple_choice", [1, 0], [1]);
    expectInvalidStudentAnswer("multiple_choice", [1, 0], [1, 0, 1]);
    expectInvalidStudentAnswer("multiple_choice", [1, 0], []);
    expectInvalidStudentAnswer("fill_blank", ["a", "b"], ["a"]);
    expectInvalidStudentAnswer("fill_blank", ["a"], ["a", "b"]);
    expectInvalidStudentAnswer("listening_fill", ["a", "b"], ["a"]);
    expectInvalidStudentAnswer("error_correction", ["goes"], []);
    expectInvalidStudentAnswer("error_correction", ["goes"], ["go", "goes"]);
    // matching: nhiều hơn số cặp
    expectInvalidStudentAnswer(
      "matching",
      [[0, 0], [1, 1]],
      [[0, 0], [1, 1], [0, 1]]
    );
  });

  it("sai kiểu phần tử", () => {
    expectInvalidStudentAnswer("multiple_choice", [1, 0], ["1", 0]);
    expectInvalidStudentAnswer("multiple_choice", [1, 0], [1.5, 0]);
    expectInvalidStudentAnswer("multiple_choice", [1, 0], [-1, 0]);
    expectInvalidStudentAnswer("multiple_choice", [1, 0], [true, 0]);
    expectInvalidStudentAnswer("fill_blank", ["a"], [5]);
    expectInvalidStudentAnswer("fill_blank", ["a"], [["a"]]);
    expectInvalidStudentAnswer("listening_fill", ["a"], [{}]);
    expectInvalidStudentAnswer("error_correction", ["goes"], [true]);
  });

  it("matching: sai kiểu / sai dạng cặp", () => {
    const answer = [[0, 0], [1, 1]];
    expectInvalidStudentAnswer("matching", answer, ["0-0"]);
    expectInvalidStudentAnswer("matching", answer, [[0]]);
    expectInvalidStudentAnswer("matching", answer, [[0, 0, 0]]);
    expectInvalidStudentAnswer("matching", answer, [["0", 0]]);
    expectInvalidStudentAnswer("matching", answer, [[0.5, 0]]);
    expectInvalidStudentAnswer("matching", answer, [[0, -1]]);
    expectInvalidStudentAnswer("matching", answer, [[null, 0]]);
  });

  it("matching: trùng chỉ số hoặc vượt phạm vi", () => {
    const answer = [[0, 0], [1, 1]];
    expectInvalidStudentAnswer("matching", answer, [[0, 0], [0, 1]]); // trùng trái
    expectInvalidStudentAnswer("matching", answer, [[0, 1], [1, 1]]); // trùng phải
    expectInvalidStudentAnswer("matching", answer, [[2, 0]]); // trái vượt phạm vi
    expectInvalidStudentAnswer("matching", answer, [[0, 9]]); // phải vượt phạm vi
  });

  it("câu trả lời quá dài (> 500 ký tự)", () => {
    expectInvalidStudentAnswer("fill_blank", ["a"], ["x".repeat(501)]);
  });

  it("message tiếng Việt, có đường dẫn tới chỗ sai", () => {
    expectGradingError(
      () => gradeExercise("multiple_choice", {}, [1, 0], ["a", 0]),
      400,
      INVALID_STUDENT_ANSWER_CODE,
      /bài làm\[0\]: Lựa chọn phải là số/
    );
    expectGradingError(
      () => gradeExercise("fill_blank", {}, ["a", "b"], ["a"]),
      400,
      INVALID_STUDENT_ANSWER_CODE,
      /phải có đúng 2 phần tử/
    );
  });

  it("nhiều lỗi: chỉ hiện tối đa 5 và ghi số lỗi còn lại", () => {
    const answer = Array(8).fill(0);
    const student = Array(8).fill("sai");
    expectGradingError(
      () => gradeExercise("multiple_choice", {}, answer, student),
      400,
      INVALID_STUDENT_ANSWER_CODE,
      /\(và 3 lỗi khác\)/
    );
  });
});

describe("gradeExercise - dữ liệu bài hỏng", () => {
  it("answer của GV không phải mảng -> 500 INVALID_EXERCISE_DATA", () => {
    for (const badAnswer of [null, undefined, "goes", { a: 1 }]) {
      expectGradingError(
        () => gradeExercise("fill_blank", {}, badAnswer, ["a"]),
        500,
        INVALID_EXERCISE_DATA_CODE,
        /Đáp án của bài tập không hợp lệ/
      );
    }
  });
});

describe("round2", () => {
  it("làm tròn 2 chữ số thập phân", () => {
    expect(round2(0)).toBe(0);
    expect(round2(10)).toBe(10);
    expect(round2((2 / 3) * 10)).toBe(6.67);
    expect(round2((1 / 3) * 10)).toBe(3.33);
    expect(round2(3.14159)).toBe(3.14);
    expect(round2(1.005)).toBe(1.01);
  });
});

describe("gradeExercise - làm tròn và ép điểm trong [0, 10]", () => {
  const FAKE = "fake_score_type";
  afterEach(() => {
    unregisterGrader(FAKE);
  });

  const withScore = (score: number) =>
    registerGrader(FAKE, {
      grade: () => ({ score, maxScore: 10, correct: 1, total: 3, errors: [] }),
      parseStudentAnswer: (value) => ({ success: true, data: value }),
    });

  it.each([
    [6.666666, 6.67],
    [3.14159, 3.14],
    [7, 7],
    [10, 10],
    [0, 0],
    [12.5, 10], // vượt trần -> 10
    [-3, 0], // âm -> 0
  ])("hàm chấm trả %s -> gradeExercise trả %s", (raw, expected) => {
    withScore(raw);
    expect(gradeExercise(FAKE, {}, [1], [1]).score).toBe(expected);
  });

  it("maxScore luôn là 10, giữ nguyên correct/total/errors", () => {
    registerGrader(FAKE, {
      grade: () =>
        ({
          score: 5,
          maxScore: 99,
          correct: 2,
          total: 4,
          errors: [{ type: "vocab", text: "x", correction: "y" }],
        }) as unknown as GradeResult,
      parseStudentAnswer: (value) => ({ success: true, data: value }),
    });
    const result = gradeExercise(FAKE, {}, [1], [1]);
    expect(result.maxScore).toBe(10);
    expect(result.correct).toBe(2);
    expect(result.total).toBe(4);
    expect(result.errors).toEqual([{ type: "vocab", text: "x", correction: "y" }]);
  });
});

describe("registry - thêm dạng giả không làm hỏng dạng khác", () => {
  const FAKE = "fake_type";
  const fakeGrade = vi.fn(
    (): GradeResult => ({ score: 7, maxScore: 10, correct: 7, total: 10, errors: [] })
  );
  const fakeEntry: AnyRegistryEntry = {
    grade: fakeGrade,
    parseStudentAnswer: (value) => ({ success: true, data: value }),
  };

  afterEach(() => {
    unregisterGrader(FAKE);
    fakeGrade.mockClear();
  });

  it("dạng giả chạy được; 5 dạng thật vẫn chạy, writing/speaking vẫn bị loại", () => {
    registerGrader(FAKE, fakeEntry);

    expect(gradeExercise(FAKE, {}, [1], ["bất kỳ"]).score).toBe(7);
    expect(fakeGrade).toHaveBeenCalledTimes(1);

    for (const [type, answer, student] of VALID_CASES) {
      expectValidGradeResult(gradeExercise(type, {}, answer, student), answer.length);
    }
    expectNotAutoGradable("writing");
    expectNotAutoGradable("speaking");
    expect(fakeGrade).toHaveBeenCalledTimes(1); // dạng thật không gọi nhầm dạng giả
  });

  it("gỡ dạng giả -> trở lại 'không chấm tự động', dạng thật không đổi", () => {
    registerGrader(FAKE, fakeEntry);
    expect(unregisterGrader(FAKE)).toBe(true);
    expectNotAutoGradable(FAKE);
    expect(unregisterGrader(FAKE)).toBe(false);
    for (const type of AUTO_GRADED_TYPES) {
      expect(getGrader(type)).toBeDefined();
    }
  });

  it("đăng ký trùng type -> lỗi, không ghi đè", () => {
    expect(() => registerGrader("multiple_choice", fakeEntry)).toThrow(/đã được đăng ký/);
    expectValidGradeResult(
      gradeExercise("multiple_choice", {}, [1, 0], [1, 0]),
      2
    );
    expect(fakeGrade).not.toHaveBeenCalled();
  });

  it("bài làm sai hình dạng thì hàm chấm không được gọi", () => {
    registerGrader(FAKE, {
      grade: fakeGrade,
      parseStudentAnswer: (value, expected) =>
        Array.isArray(value) && value.length === expected
          ? { success: true, data: value }
          : { success: false, message: "sai độ dài" },
    });
    expectInvalidStudentAnswer(FAKE, [1, 2], [1]);
    expect(fakeGrade).not.toHaveBeenCalled();
    gradeExercise(FAKE, {}, [1, 2], [1, 2]);
    expect(fakeGrade).toHaveBeenCalledTimes(1);
  });
});