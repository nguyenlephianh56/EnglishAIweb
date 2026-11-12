import { describe, expect, it } from "vitest";
import {
  AI_QUOTA_EXCEEDED_CODE,
  AI_TASKS,
  AIQuotaExceededError,
  aiTaskSchema,
} from "./ai.types";

describe("aiTaskSchema", () => {
  it.each(AI_TASKS)("chấp nhận task hợp lệ: %s", (task) => {
    expect(aiTaskSchema.safeParse(task).success).toBe(true);
  });

  it.each(["", "grade", "GENERATE", "grade_writing ", 1, null, undefined])(
    "từ chối task ngoài danh sách: %s",
    (task) => {
      expect(aiTaskSchema.safeParse(task).success).toBe(false);
    }
  );

  it("đúng 5 task như Project.md", () => {
    expect([...AI_TASKS]).toEqual([
      "grade_writing",
      "grade_speaking",
      "generate",
      "analysis",
      "path",
    ]);
  });
});

describe("AIQuotaExceededError", () => {
  it("có code AI_QUOTA_EXCEEDED, HTTP 429, message tiếng Việt", () => {
    const err = new AIQuotaExceededError();
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe(AI_QUOTA_EXCEEDED_CODE);
    expect(err.code).toBe("AI_QUOTA_EXCEEDED");
    expect(err.statusCode).toBe(429);
    expect(err.message).toMatch(/hết lượt/);
  });

  it("khác mã RATE_LIMITED của Gemini", () => {
    expect(new AIQuotaExceededError().code).not.toBe("RATE_LIMITED");
  });
});