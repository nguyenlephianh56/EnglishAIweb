import { describe, expect, it } from "vitest";
import { EXERCISE_TYPES, type ExerciseType } from "../../modules/exercises/exercise-content.schema";
import { validateExercise } from "../../modules/exercises/validate-exercise";
import { EXERCISE_SHAPES, buildExerciseShape } from "./exercise-shape";
import { PROMPT_NOT_FOUND_CODE, PromptError } from "./render";

/** Các field của `content` mà ví dụ của từng dạng phải minh họa (kể cả field tùy chọn). */
const EXPECTED_CONTENT_KEYS: Record<ExerciseType, string[]> = {
  multiple_choice: ["passage", "questions"],
  fill_blank: ["text", "hint"],
  matching: ["left", "right"],
  error_correction: ["sentence", "wrong"],
  listening_fill: ["script", "blanks"],
  writing: ["prompt", "minWords"],
  speaking: ["prompt", "sample"],
};

describe("EXERCISE_SHAPES — bảng khuôn 7 dạng bài", () => {
  it("phủ đúng đủ các dạng bài của T1 (không thừa, không thiếu)", () => {
    expect(Object.keys(EXERCISE_SHAPES).sort()).toEqual([...EXERCISE_TYPES].sort());
  });

  it.each(EXERCISE_TYPES)("%s: ví dụ qua được validateExercise của T1", (type) => {
    const { content, answer } = EXERCISE_SHAPES[type].example;
    const result = validateExercise(type, content, answer);
    expect(result.success, JSON.stringify(result)).toBe(true);
  });

  it.each(EXERCISE_TYPES)("%s: ví dụ minh họa đúng các field của content và mỗi field có trong khuôn", (type) => {
    const spec = EXERCISE_SHAPES[type];
    const keys = Object.keys(spec.example.content as Record<string, unknown>);
    expect(keys.sort()).toEqual([...EXPECTED_CONTENT_KEYS[type]].sort());
    for (const key of keys) expect(spec.contentShape).toContain(`"${key}"`);
  });

  it.each(EXERCISE_TYPES)("%s: có đủ mô tả content, answer, count, quy tắc", (type) => {
    const text = buildExerciseShape(type);
    expect(text).toContain(`Exercise type: ${type}`);
    expect(text).toContain(`"content" must be`);
    expect(text).toContain(`"answer" must be`);
    expect(text).toContain(`"count"`);
    expect(text).toContain("Rules:");
    expect(text).not.toContain("{{");
  });
});

describe("buildExerciseShape — nội dung theo từng dạng", () => {
  it("multiple_choice: chỉ số bắt đầu từ 0 (khớp schema T1)", () => {
    expect(buildExerciseShape("multiple_choice")).toContain("0-BASED");
  });

  it("fill_blank và listening_fill: chỗ trống là ___ và số chỗ trống khớp answer", () => {
    for (const type of ["fill_blank", "listening_fill"]) {
      const text = buildExerciseShape(type);
      expect(text).toContain("___");
      expect(text).toContain(`length of "answer"`);
    }
  });

  it("matching: dặn xáo cột phải, cặp [trái, phải]", () => {
    const text = buildExerciseShape("matching");
    expect(text).toContain("Shuffle");
    expect(text).toContain("leftIndex");
  });

  it("error_correction: 'wrong' chép nguyên văn, answer đúng 1 phần tử", () => {
    const text = buildExerciseShape("error_correction");
    expect(text).toContain("EXACTLY");
    expect(text).toContain("exactly ONE string");
  });

  it("writing/speaking: answer là null", () => {
    for (const type of ["writing", "speaking"]) {
      const text = buildExerciseShape(type);
      expect(text).toContain(`"answer": null`);
    }
  });

  it("kết quả ổn định (gọi 2 lần giống nhau)", () => {
    for (const type of EXERCISE_TYPES) {
      expect(buildExerciseShape(type)).toBe(buildExerciseShape(type));
    }
  });

  it("dạng bài lạ -> PROMPT_NOT_FOUND (kể cả tên prototype)", () => {
    for (const type of ["", "essay", "constructor", "__proto__", "MULTIPLE_CHOICE"]) {
      try {
        buildExerciseShape(type);
        throw new Error("phải ném lỗi");
      } catch (error) {
        expect(error).toBeInstanceOf(PromptError);
        expect((error as PromptError).code).toBe(PROMPT_NOT_FOUND_CODE);
      }
    }
  });
});