import { describe, expect, it } from "vitest";
import { SPEAKING_TRANSCRIPT_MAX_CHARS } from "../../ai/speaking.constants";
import { validateExercise } from "../exercises/validate-exercise";
import {
  speakingAttemptAnswerSchema,
  writingAnswerSchema,
  type SpeakingAttemptAnswer,
} from "./attempts.schema";

// Test thuần (không DB): dạng LƯU của attempts.answer cho bài speaking là { text }.

const parse = (value: unknown) => speakingAttemptAnswerSchema.safeParse(value);

describe("speakingAttemptAnswerSchema - hợp lệ", () => {
  it("nhận { text } hợp lệ", () => {
    const r = parse({ text: "I like English" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ text: "I like English" });
  });

  it("trim hai đầu nhưng giữ nguyên hoa/thường và dấu câu", () => {
    const r = parse({ text: "  Hello, My name is An!  \n" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ text: "Hello, My name is An!" });
  });

  it("đúng bằng giới hạn độ dài thì pass", () => {
    const text = "a".repeat(SPEAKING_TRANSCRIPT_MAX_CHARS);
    expect(parse({ text }).success).toBe(true);
  });

  it("độ dài đếm SAU khi trim (đệm khoảng trắng không làm vượt giới hạn)", () => {
    const text = ` ${"a".repeat(SPEAKING_TRANSCRIPT_MAX_CHARS)} `;
    expect(parse({ text }).success).toBe(true);
  });

  it("kiểu SpeakingAttemptAnswer là { text: string }", () => {
    const value: SpeakingAttemptAnswer = { text: "ok" };
    expect(value.text).toBe("ok");
  });
});

describe("speakingAttemptAnswerSchema - từ chối", () => {
  it("vượt giới hạn 1 ký tự", () => {
    const r = parse({ text: "a".repeat(SPEAKING_TRANSCRIPT_MAX_CHARS + 1) });
    expect(r.success).toBe(false);
  });

  it.each([
    ["thiếu text", {}],
    ["text rỗng", { text: "" }],
    ["text toàn khoảng trắng", { text: "   \n\t " }],
    ["text là số", { text: 5 }],
    ["text là null", { text: null }],
    ["text là mảng", { text: ["a"] }],
    ["text là object", { text: { a: 1 } }],
    ["body là mảng", ["Hello"]],
    ["body là chuỗi", "Hello"],
    ["body là null", null],
    ["body là undefined", undefined],
  ])("từ chối: %s", (_name, value) => {
    expect(parse(value).success).toBe(false);
  });

  it.each([
    ["audio_id", { text: "Hello", audio_id: 1 }],
    ["transcript", { text: "Hello", transcript: "Hello" }],
    ["source", { text: "Hello", source: "gemini" }],
    ["score", { text: "Hello", score: 10 }],
  ])("từ chối field lạ (.strict): %s", (_name, value) => {
    expect(parse(value).success).toBe(false);
  });

  it("thông báo lỗi không chép lại nội dung bản chữ", () => {
    const secret = "my-private-speech-content";
    const r = parse({ text: secret, extra: 1 });
    expect(r.success).toBe(false);
    if (!r.success) expect(JSON.stringify(r.error.issues)).not.toContain(secret);
  });
});

describe("không hồi quy", () => {
  it("writingAnswerSchema vẫn là { text } như cũ", () => {
    expect(writingAnswerSchema.safeParse({ text: "  Hi  " })).toMatchObject({
      success: true,
      data: { text: "Hi" },
    });
    expect(writingAnswerSchema.safeParse({}).success).toBe(false);
    expect(writingAnswerSchema.safeParse({ text: "Hi", x: 1 }).success).toBe(false);
  });

  it("validateExercise cho speaking ({prompt, sample?}, answer NULL) không đổi", () => {
    const content = { prompt: "Introduce yourself.", sample: "My name is An." };
    expect(validateExercise("speaking", content, null)).toEqual({
      success: true,
      data: { content, answer: null },
    });
    expect(validateExercise("speaking", { prompt: "Talk." }, ["hello"]).success).toBe(false);
  });
});