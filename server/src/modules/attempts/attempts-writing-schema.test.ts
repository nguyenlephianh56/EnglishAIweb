import { describe, expect, it } from "vitest";
import { WRITING_TEXT_MAX } from "./attempts.constants";
import { buildAttemptResult } from "./attempt-result";
import { createAttemptSchema, writingAnswerSchema } from "./attempts.schema";

// Test thuần (không DB): hình dạng bài làm dạng writing là { text }.

const parse = (value: unknown) => writingAnswerSchema.safeParse(value);

describe("writingAnswerSchema", () => {
  it("nhận { text } hợp lệ và trim hai đầu", () => {
    const r = parse({ text: "  I went to school yesterday.  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ text: "I went to school yesterday." });
  });

  it.each([
    ["rỗng", { text: "" }],
    ["chỉ khoảng trắng", { text: "   \n\t " }],
    ["thiếu text", {}],
    ["text là số", { text: 5 }],
    ["text là null", { text: null }],
    ["text là mảng", { text: ["a"] }],
    ["answer là chuỗi", "Hello"],
    ["answer là mảng", ["Hello"]],
    ["answer là null", null],
    ["answer là undefined", undefined],
  ])("từ chối: %s", (_name, value) => {
    expect(parse(value).success).toBe(false);
  });

  it.each(["score", "is_late", "isLate", "student_id", "studentId", "errors"])(
    "từ chối field thừa trong answer: %s",
    (field) => {
      expect(parse({ text: "Hello", [field]: 1 }).success).toBe(false);
    }
  );

  it("đúng trần ký tự thì qua, vượt trần thì từ chối", () => {
    expect(parse({ text: "a".repeat(WRITING_TEXT_MAX) }).success).toBe(true);
    expect(parse({ text: "a".repeat(WRITING_TEXT_MAX + 1) }).success).toBe(false);
  });

  it("trần đếm SAU khi trim (khoảng trắng đầu/cuối không tính)", () => {
    const padded = ` ${"a".repeat(WRITING_TEXT_MAX)} `;
    expect(parse({ text: padded }).success).toBe(true);
  });

  it("thông báo lỗi không chép lại nội dung bài viết", () => {
    const secret = "NOI_DUNG_RIENG_TU_" + "x".repeat(WRITING_TEXT_MAX);
    const r = parse({ text: secret });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(JSON.stringify(r.error.issues)).not.toContain("NOI_DUNG_RIENG_TU_");
    }
  });
});

describe("createAttemptSchema vẫn nhận answer writing mà không kiểm hình dạng", () => {
  it("hình dạng answer do service kiểm theo dạng bài (writing -> writingAnswerSchema)", () => {
    const r = createAttemptSchema.safeParse({ exerciseId: 1, answer: { text: "Hi" } });
    expect(r.success).toBe(true);
  });
});

describe("buildAttemptResult với bài writing chưa chấm", () => {
  const attempt = { id: 1, score: null, maxScore: 10, errors: [] };
  const exercise = {
    id: 9,
    type: "writing",
    skill: "WRITING",
    level: "B1",
    topic: "Weekend",
    content: { prompt: "Write about your weekend.", minWords: 50 },
    answer: null,
    explanation: "Gợi ý của GV.",
  };

  it("score NULL, không có key answer, explanation chỉ khi reveal", () => {
    const shown = buildAttemptResult(attempt, exercise, { reveal: true });
    expect(shown.score).toBeNull();
    expect(shown.errors).toEqual([]);
    expect("answer" in shown).toBe(false);
    expect(shown.explanation).toBe("Gợi ý của GV.");

    const hidden = buildAttemptResult(attempt, exercise, { reveal: false });
    expect("answer" in hidden).toBe(false);
    expect("explanation" in hidden).toBe(false);
  });
});