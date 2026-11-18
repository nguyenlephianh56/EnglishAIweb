import { describe, expect, it } from "vitest";
import { SPEAKING_MAX_WORD_ISSUES } from "../speaking.constants";
import { compareWithSample } from "../speakingWords";
import { createSpeakingGradeResultSchema } from "./speaking-grade.schema";

describe("compareWithSample", () => {
  it.each([
    ["I like apples", "I like apples", 1],
    ["I like apples", "She likes grapes", 0],
    ["(HELLO), world!", "hello world", 1],
    ["I DON'T like well-known songs.", "I dont like well known songs", 1],
    ["Yes no", "yes yes no", 2 / 3],
    ["Apples like I", "I like apples", 1],
    ["I like apples", undefined, null],
    ["I like apples", "", null],
    ["I like apples", " ... ! ", null],
  ])("so khớp %j với %j", (transcript, sample, expected) => {
    expect(compareWithSample(transcript, sample)).toBe(expected);
  });
});

describe("createSpeakingGradeResultSchema", () => {
  const schema = createSpeakingGradeResultSchema("I like apples.");
  const valid = {
    criteria: { content: 10, fluency: 7.25, pronunciation: 0 },
    wordIssues: [],
    comment: "Câu trả lời đúng trọng tâm.",
  };

  it("chấp nhận điểm ở hai biên, điểm lẻ và danh sách lỗi rỗng", () => {
    expect(schema.parse(valid)).toEqual(valid);
  });

  it.each([undefined, -0.01, 10.01, NaN, Infinity, "7"])(
    "từ chối điểm không hợp lệ %j",
    (content) => {
      expect(schema.safeParse({ ...valid, criteria: { ...valid.criteria, content } }).success)
        .toBe(false);
    }
  );

  it.each(["criteria", "wordIssues", "comment"] as const)("từ chối kết quả thiếu %s", (key) => {
    const input = { ...valid };
    Reflect.deleteProperty(input, key);
    expect(schema.safeParse(input).success).toBe(false);
  });

  it("từ chối trường transcript trong phản hồi AI", () => {
    expect(schema.safeParse({ ...valid, transcript: "I like apples." }).success).toBe(false);
  });

  it("chỉ giữ từ nguyên vẹn trong bản chữ, bỏ qua hoa thường và dấu câu", () => {
    const present = { word: "APPLES", issue: "Chú ý âm cuối." };
    const absent = { word: "apple", issue: "Chú ý âm cuối." };
    expect(schema.parse({ ...valid, wordIssues: [present, absent] }).wordIssues)
      .toEqual([present]);
  });

  it("lọc từ vắng mặt rồi cắt tại giới hạn", () => {
    const present = Array.from({ length: SPEAKING_MAX_WORD_ISSUES + 1 }, (_, i) => ({
      word: `word${i}`,
      issue: "Chú ý âm cuối.",
    }));
    const transcript = present.map(({ word }) => word).join(" ");
    const resultSchema = createSpeakingGradeResultSchema(transcript);
    const result = resultSchema.parse({
      ...valid,
      wordIssues: [{ word: "absent", issue: "Chú ý âm cuối." }, ...present],
    });

    expect(result.wordIssues).toEqual(present.slice(0, SPEAKING_MAX_WORD_ISSUES));
    expect(resultSchema.parse(result)).toEqual(result);
  });
});