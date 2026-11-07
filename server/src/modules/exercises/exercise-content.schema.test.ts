import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  multipleChoiceContentSchema,
  multipleChoiceAnswerSchema,
  fillBlankContentSchema,
  fillBlankAnswerSchema,
  matchingContentSchema,
  matchingAnswerSchema,
  errorCorrectionContentSchema,
  errorCorrectionAnswerSchema,
  listeningFillContentSchema,
  listeningFillAnswerSchema,
  writingContentSchema,
  writingAnswerSchema,
  speakingContentSchema,
  speakingAnswerSchema,
  exerciseTypeSchema,
  exerciseSchemas,
  EXERCISE_TYPES,
  countBlanks,
} from "./exercise-content.schema";

/** Chạy safeParse và trả về danh sách lỗi dạng { path: "a.0.b", message } để dễ kiểm tra. */
function issuesOf(schema: z.ZodTypeAny, data: unknown) {
  const result = schema.safeParse(data);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

/** Kiểm tra có đúng một lỗi tại `path` và thông báo chứa `text`. */
function expectIssue(
  schema: z.ZodTypeAny,
  data: unknown,
  path: string,
  text: string
) {
  const issues = issuesOf(schema, data);
  const found = issues.find((i) => i.path === path && i.message.includes(text));
  expect(found, JSON.stringify(issues)).toBeDefined();
}

// ===========================================================================
describe("countBlanks", () => {
  it("đếm cụm gạch dưới >= 3 ký tự là 1 chỗ trống", () => {
    expect(countBlanks("He ___ to school.")).toBe(1);
    expect(countBlanks("A ___ and B _____.")).toBe(2);
    expect(countBlanks("Không có chỗ trống")).toBe(0);
    expect(countBlanks("Chỉ hai gạch __ thì không tính")).toBe(0);
  });
});

// ===========================================================================
describe("multiple_choice", () => {
  const validFull = {
    passage: "Tom lives in a small town.",
    questions: [
      { q: "Where does Tom live?", options: ["A city", "A small town", "A village"] },
      { q: "Is Tom a student?", options: ["Yes", "No"] },
    ],
  };

  it("content hợp lệ đầy đủ", () => {
    expect(multipleChoiceContentSchema.safeParse(validFull).success).toBe(true);
  });

  it("content hợp lệ tối giản (không có passage)", () => {
    const data = { questions: [{ q: "2 + 2 = ?", options: ["3", "4"] }] };
    expect(multipleChoiceContentSchema.safeParse(data).success).toBe(true);
  });

  it("content: trim chuỗi", () => {
    const result = multipleChoiceContentSchema.parse({
      questions: [{ q: "  Hi?  ", options: [" a ", " b "] }],
    });
    expect(result.questions[0].q).toBe("Hi?");
    expect(result.questions[0].options).toEqual(["a", "b"]);
  });

  it("content sai: thiếu questions", () => {
    expectIssue(multipleChoiceContentSchema, {}, "questions", "bắt buộc");
  });

  it("content sai: questions rỗng", () => {
    expectIssue(multipleChoiceContentSchema, { questions: [] }, "questions", "ít nhất 1");
  });

  it("content sai: câu hỏi rỗng / chỉ khoảng trắng", () => {
    expectIssue(
      multipleChoiceContentSchema,
      { questions: [{ q: "   ", options: ["a", "b"] }] },
      "questions.0.q",
      "không được để trống"
    );
  });

  it("content sai: options ít hơn 2", () => {
    expectIssue(
      multipleChoiceContentSchema,
      { questions: [{ q: "Q?", options: ["a"] }] },
      "questions.0.options",
      "ít nhất 2"
    );
  });

  it("content sai: lựa chọn rỗng", () => {
    expectIssue(
      multipleChoiceContentSchema,
      { questions: [{ q: "Q?", options: ["a", ""] }] },
      "questions.0.options.1",
      "không được để trống"
    );
  });

  it("content sai: lựa chọn trùng nhau", () => {
    expectIssue(
      multipleChoiceContentSchema,
      { questions: [{ q: "Q?", options: ["Yes", "yes"] }] },
      "questions.0.options.1",
      "bị trùng"
    );
  });

  it("content sai: sai kiểu (q là số)", () => {
    expectIssue(
      multipleChoiceContentSchema,
      { questions: [{ q: 5, options: ["a", "b"] }] },
      "questions.0.q",
      "phải là chuỗi"
    );
  });

  it("content sai: quá 20 câu hỏi", () => {
    const questions = Array.from({ length: 21 }, () => ({ q: "Q?", options: ["a", "b"] }));
    expectIssue(multipleChoiceContentSchema, { questions }, "questions", "không được vượt quá 20");
  });

  it("content sai: quá 6 lựa chọn", () => {
    const options = ["1", "2", "3", "4", "5", "6", "7"];
    expectIssue(
      multipleChoiceContentSchema,
      { questions: [{ q: "Q?", options }] },
      "questions.0.options",
      "không được vượt quá 6"
    );
  });

  it("content sai: field thừa bị từ chối", () => {
    const result = multipleChoiceContentSchema.safeParse({ ...validFull, extra: 1 });
    expect(result.success).toBe(false);
  });

  it("answer hợp lệ", () => {
    expect(multipleChoiceAnswerSchema.safeParse([1, 0]).success).toBe(true);
    expect(multipleChoiceAnswerSchema.safeParse([0]).success).toBe(true);
  });

  it("answer sai: không phải mảng / rỗng / số âm / số thực / sai kiểu", () => {
    expect(multipleChoiceAnswerSchema.safeParse("1").success).toBe(false);
    expect(multipleChoiceAnswerSchema.safeParse([]).success).toBe(false);
    expectIssue(multipleChoiceAnswerSchema, [-1], "0", "không được là số âm");
    expectIssue(multipleChoiceAnswerSchema, [1.5], "0", "số nguyên");
    expectIssue(multipleChoiceAnswerSchema, ["1"], "0", "phải là số");
  });
});

// ===========================================================================
describe("fill_blank", () => {
  it("content hợp lệ đầy đủ", () => {
    const data = { text: "He ___ to school every day.", hint: "go" };
    expect(fillBlankContentSchema.safeParse(data).success).toBe(true);
  });

  it("content hợp lệ tối giản (không có hint)", () => {
    expect(fillBlankContentSchema.safeParse({ text: "I ___ happy." }).success).toBe(true);
  });

  it("content sai: thiếu text", () => {
    expectIssue(fillBlankContentSchema, {}, "text", "bắt buộc");
  });

  it("content sai: text rỗng", () => {
    expectIssue(fillBlankContentSchema, { text: "   " }, "text", "không được để trống");
  });

  it("content sai: text không có chỗ trống", () => {
    expectIssue(fillBlankContentSchema, { text: "No blank here." }, "text", "chỗ trống");
  });

  it("content sai: sai kiểu", () => {
    expectIssue(fillBlankContentSchema, { text: 123 }, "text", "phải là chuỗi");
  });

  it("content sai: hint chỉ có khoảng trắng", () => {
    expectIssue(fillBlankContentSchema, { text: "I ___ happy.", hint: "  " }, "hint", "không được để trống");
  });

  it("content sai: text quá dài", () => {
    const text = "___ " + "a".repeat(5000);
    expectIssue(fillBlankContentSchema, { text }, "text", "không được vượt quá 5000");
  });

  it("answer hợp lệ", () => {
    expect(fillBlankAnswerSchema.safeParse(["goes"]).success).toBe(true);
    expect(fillBlankAnswerSchema.safeParse(["a", "b"]).success).toBe(true);
  });

  it("answer sai: rỗng / phần tử rỗng / sai kiểu", () => {
    expect(fillBlankAnswerSchema.safeParse([]).success).toBe(false);
    expectIssue(fillBlankAnswerSchema, ["goes", "  "], "1", "không được để trống");
    expectIssue(fillBlankAnswerSchema, [5], "0", "phải là chuỗi");
    expect(fillBlankAnswerSchema.safeParse("goes").success).toBe(false);
  });
});

// ===========================================================================
describe("matching", () => {
  it("content hợp lệ (đầy đủ = tối giản vì không có field tùy chọn)", () => {
    const data = { left: ["dog", "cat"], right: ["chó", "mèo"] };
    expect(matchingContentSchema.safeParse(data).success).toBe(true);
  });

  it("content sai: thiếu field", () => {
    expectIssue(matchingContentSchema, { left: ["a", "b"] }, "right", "bắt buộc");
  });

  it("content sai: ít hơn 2 phần tử", () => {
    expectIssue(matchingContentSchema, { left: ["a"], right: ["b"] }, "left", "ít nhất 2");
  });

  it("content sai: khác độ dài", () => {
    expectIssue(
      matchingContentSchema,
      { left: ["a", "b", "c"], right: ["x", "y"] },
      "right",
      "cùng độ dài"
    );
  });

  it("content sai: phần tử rỗng", () => {
    expectIssue(
      matchingContentSchema,
      { left: ["a", ""], right: ["x", "y"] },
      "left.1",
      "không được để trống"
    );
  });

  it("content sai: sai kiểu", () => {
    expectIssue(matchingContentSchema, { left: "ab", right: ["x", "y"] }, "left", "phải là một mảng");
  });

  it("answer hợp lệ", () => {
    expect(matchingAnswerSchema.safeParse([[0, 1], [1, 0]]).success).toBe(true);
  });

  it("answer sai: trùng chỉ số trái", () => {
    expectIssue(matchingAnswerSchema, [[0, 0], [0, 1]], "1.0", "bị dùng nhiều lần");
  });

  it("answer sai: trùng chỉ số phải", () => {
    expectIssue(matchingAnswerSchema, [[0, 1], [1, 1]], "1.1", "bị dùng nhiều lần");
  });

  it("answer sai: cặp không đủ 2 phần tử / sai kiểu / số âm", () => {
    expect(matchingAnswerSchema.safeParse([[0], [1, 1]]).success).toBe(false);
    expect(matchingAnswerSchema.safeParse([[0, 1, 2], [1, 0]]).success).toBe(false);
    expect(matchingAnswerSchema.safeParse([0, 1]).success).toBe(false);
    expectIssue(matchingAnswerSchema, [["0", 1], [1, 0]], "0.0", "phải là số");
    expectIssue(matchingAnswerSchema, [[-1, 0], [1, 1]], "0.0", "không được là số âm");
  });

  it("answer sai: ít hơn 2 cặp", () => {
    expectIssue(matchingAnswerSchema, [[0, 0]], "", "ít nhất 2");
  });
});

// ===========================================================================
describe("error_correction", () => {
  it("content hợp lệ", () => {
    const data = { sentence: "He go to school.", wrong: "go" };
    expect(errorCorrectionContentSchema.safeParse(data).success).toBe(true);
  });

  it("content hợp lệ: wrong là cả câu", () => {
    const data = { sentence: "He go", wrong: "He go" };
    expect(errorCorrectionContentSchema.safeParse(data).success).toBe(true);
  });

  it("content sai: thiếu field", () => {
    expectIssue(errorCorrectionContentSchema, { sentence: "He go." }, "wrong", "bắt buộc");
    expectIssue(errorCorrectionContentSchema, { wrong: "go" }, "sentence", "bắt buộc");
  });

  it("content sai: chuỗi rỗng", () => {
    expectIssue(
      errorCorrectionContentSchema,
      { sentence: "He go.", wrong: "  " },
      "wrong",
      "không được để trống"
    );
  });

  it("content sai: sai kiểu", () => {
    expectIssue(errorCorrectionContentSchema, { sentence: 1, wrong: "go" }, "sentence", "phải là chuỗi");
  });

  it("content sai: wrong không nằm trong sentence", () => {
    expectIssue(
      errorCorrectionContentSchema,
      { sentence: "He go to school.", wrong: "went" },
      "wrong",
      "xuất hiện nguyên văn"
    );
  });

  it("content sai: wrong khác hoa/thường so với sentence", () => {
    expectIssue(
      errorCorrectionContentSchema,
      { sentence: "He go to school.", wrong: "GO" },
      "wrong",
      "xuất hiện nguyên văn"
    );
  });

  it("answer hợp lệ", () => {
    expect(errorCorrectionAnswerSchema.safeParse(["goes"]).success).toBe(true);
  });

  it("answer sai: rỗng / 2 phần tử / chuỗi rỗng / sai kiểu", () => {
    expectIssue(errorCorrectionAnswerSchema, [], "", "đúng 1 phần tử");
    expectIssue(errorCorrectionAnswerSchema, ["goes", "went"], "", "đúng 1 phần tử");
    expectIssue(errorCorrectionAnswerSchema, ["  "], "0", "không được để trống");
    expectIssue(errorCorrectionAnswerSchema, [5], "0", "phải là chuỗi");
    expect(errorCorrectionAnswerSchema.safeParse("goes").success).toBe(false);
  });
});

// ===========================================================================
describe("listening_fill", () => {
  it("content hợp lệ", () => {
    const data = { script: "I go to school at seven o'clock.", blanks: 2 };
    expect(listeningFillContentSchema.safeParse(data).success).toBe(true);
  });

  it("content hợp lệ tối giản (blanks = 1)", () => {
    expect(listeningFillContentSchema.safeParse({ script: "Hello.", blanks: 1 }).success).toBe(true);
  });

  it("content sai: thiếu field", () => {
    expectIssue(listeningFillContentSchema, { blanks: 1 }, "script", "bắt buộc");
    expectIssue(listeningFillContentSchema, { script: "Hello." }, "blanks", "bắt buộc");
  });

  it("content sai: script rỗng / sai kiểu", () => {
    expectIssue(listeningFillContentSchema, { script: "  ", blanks: 1 }, "script", "không được để trống");
    expectIssue(listeningFillContentSchema, { script: 5, blanks: 1 }, "script", "phải là chuỗi");
  });

  it("content sai: blanks = 0, âm, số thực, chuỗi, quá lớn", () => {
    expectIssue(listeningFillContentSchema, { script: "Hi.", blanks: 0 }, "blanks", "từ 1 trở lên");
    expectIssue(listeningFillContentSchema, { script: "Hi.", blanks: -2 }, "blanks", "từ 1 trở lên");
    expectIssue(listeningFillContentSchema, { script: "Hi.", blanks: 1.5 }, "blanks", "số nguyên");
    expectIssue(listeningFillContentSchema, { script: "Hi.", blanks: "2" }, "blanks", "phải là số");
    expectIssue(listeningFillContentSchema, { script: "Hi.", blanks: 21 }, "blanks", "không được vượt quá 20");
  });

  it("answer hợp lệ", () => {
    expect(listeningFillAnswerSchema.safeParse(["seven", "bus"]).success).toBe(true);
  });

  it("answer sai: thiếu / rỗng / phần tử rỗng / sai kiểu", () => {
    expect(listeningFillAnswerSchema.safeParse(undefined).success).toBe(false);
    expect(listeningFillAnswerSchema.safeParse(null).success).toBe(false);
    expect(listeningFillAnswerSchema.safeParse([]).success).toBe(false);
    expectIssue(listeningFillAnswerSchema, ["seven", " "], "1", "không được để trống");
    expectIssue(listeningFillAnswerSchema, [7], "0", "phải là chuỗi");
  });
});

// ===========================================================================
describe("writing", () => {
  it("content hợp lệ", () => {
    const data = { prompt: "Write about your family.", minWords: 80 };
    expect(writingContentSchema.safeParse(data).success).toBe(true);
  });

  it("content sai: thiếu field", () => {
    expectIssue(writingContentSchema, { minWords: 50 }, "prompt", "bắt buộc");
    expectIssue(writingContentSchema, { prompt: "Write." }, "minWords", "bắt buộc");
  });

  it("content sai: prompt rỗng / sai kiểu", () => {
    expectIssue(writingContentSchema, { prompt: " ", minWords: 50 }, "prompt", "không được để trống");
    expectIssue(writingContentSchema, { prompt: 1, minWords: 50 }, "prompt", "phải là chuỗi");
  });

  it("content sai: minWords = 0, âm, số thực, chuỗi, quá lớn", () => {
    expectIssue(writingContentSchema, { prompt: "Write.", minWords: 0 }, "minWords", "lớn hơn 0");
    expectIssue(writingContentSchema, { prompt: "Write.", minWords: -5 }, "minWords", "lớn hơn 0");
    expectIssue(writingContentSchema, { prompt: "Write.", minWords: 10.5 }, "minWords", "số nguyên");
    expectIssue(writingContentSchema, { prompt: "Write.", minWords: "50" }, "minWords", "phải là số");
    expectIssue(writingContentSchema, { prompt: "Write.", minWords: 1001 }, "minWords", "không được vượt quá 1000");
  });

  it("answer hợp lệ: null hoặc không có (đều ra null)", () => {
    const withNull = writingAnswerSchema.safeParse(null);
    const withUndefined = writingAnswerSchema.safeParse(undefined);
    expect(withNull.success && withNull.data).toBe(null);
    expect(withUndefined.success && withUndefined.data).toBe(null);
  });

  it("answer sai: có giá trị (kể cả giá trị 'rỗng')", () => {
    for (const bad of ["text", "", 0, false, [], {}, ["a"], { text: "x" }]) {
      expectIssue(writingAnswerSchema, bad, "", "không có đáp án");
    }
  });
});

// ===========================================================================
describe("speaking", () => {
  it("content hợp lệ đầy đủ", () => {
    const data = { prompt: "Introduce yourself.", sample: "My name is An." };
    expect(speakingContentSchema.safeParse(data).success).toBe(true);
  });

  it("content hợp lệ tối giản (không có sample)", () => {
    expect(speakingContentSchema.safeParse({ prompt: "Talk about your hobby." }).success).toBe(true);
  });

  it("content sai: thiếu prompt", () => {
    expectIssue(speakingContentSchema, {}, "prompt", "bắt buộc");
  });

  it("content sai: prompt rỗng / sai kiểu", () => {
    expectIssue(speakingContentSchema, { prompt: "  " }, "prompt", "không được để trống");
    expectIssue(speakingContentSchema, { prompt: 9 }, "prompt", "phải là chuỗi");
  });

  it("content sai: sample chỉ có khoảng trắng", () => {
    expectIssue(speakingContentSchema, { prompt: "Talk.", sample: "   " }, "sample", "không được để trống");
  });

  it("content sai: field thừa bị từ chối", () => {
    expect(speakingContentSchema.safeParse({ prompt: "Talk.", minWords: 5 }).success).toBe(false);
  });

  it("answer hợp lệ: null hoặc không có", () => {
    expect(speakingAnswerSchema.safeParse(null).success).toBe(true);
    expect(speakingAnswerSchema.safeParse(undefined).success).toBe(true);
  });

  it("answer sai: có giá trị", () => {
    expectIssue(speakingAnswerSchema, ["hello"], "", "không có đáp án");
    expectIssue(speakingAnswerSchema, "hello", "", "không có đáp án");
  });
});

// ===========================================================================
describe("exerciseTypeSchema & exerciseSchemas", () => {
  it("chấp nhận đủ 7 dạng bài", () => {
    for (const type of EXERCISE_TYPES) {
      expect(exerciseTypeSchema.safeParse(type).success).toBe(true);
    }
    expect(EXERCISE_TYPES).toHaveLength(7);
  });

  it("từ chối type không tồn tại với thông báo tiếng Việt liệt kê giá trị hợp lệ", () => {
    expectIssue(exerciseTypeSchema, "essay", "", "Dạng bài không hợp lệ");
    expectIssue(exerciseTypeSchema, "essay", "", "multiple_choice");
    expect(exerciseTypeSchema.safeParse(undefined).success).toBe(false);
    expect(exerciseTypeSchema.safeParse(5).success).toBe(false);
  });

  it("map có đủ contentSchema + answerSchema cho cả 7 dạng", () => {
    expect(Object.keys(exerciseSchemas).sort()).toEqual([...EXERCISE_TYPES].sort());
    for (const type of EXERCISE_TYPES) {
      expect(exerciseSchemas[type].contentSchema).toBeDefined();
      expect(exerciseSchemas[type].answerSchema).toBeDefined();
    }
  });
});