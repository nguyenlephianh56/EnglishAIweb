/**
 * Test thuần (không DB, không AI) cho toGradingError (T13: lỗi AI/hết lượt không mất bài).
 */
import { describe, it, expect } from "vitest";
import { AIQuotaExceededError, AIUsageCheckError } from "../../ai/ai.types";
import { AIInvalidFormatError } from "../../ai/json";
import { AIServiceError } from "../../ai/resilience";
import { toGradingError } from "./attempts-grading-error";

const cases: [string, unknown, string][] = [
  ["AI_QUOTA_EXCEEDED", new AIQuotaExceededError(), "hết lượt"],
  ["RATE_LIMITED", new AIServiceError("RATE_LIMITED", 2, { retryAfterMs: 1234 }), "đang bận"],
  ["TIMEOUT", new AIServiceError("TIMEOUT", 1), "hết thời gian"],
  ["AI_UNAVAILABLE", new AIServiceError("AI_UNAVAILABLE", 2), "lỗi tạm thời"],
  ["AI_INVALID_FORMAT", new AIInvalidFormatError(2), "lỗi tạm thời"],
  ["AI_ERROR", new AIServiceError("AI_ERROR", 1), "lỗi tạm thời"],
  ["AI_USAGE_CHECK_FAILED", new AIUsageCheckError(), "lỗi tạm thời"],
];

describe("toGradingError", () => {
  it.each(cases)("%s -> mã đúng, nói rõ bài đã lưu + lý do thân thiện", (code, error, reason) => {
    const result = toGradingError(error);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(code);
    expect(result!.message).toContain("đã được lưu");
    expect(result!.message).toContain("chưa được chấm");
    expect(result!.message).toContain(reason);
  });

  it("chỉ có đúng 2 field {code, message}; không lộ message gốc, số lần gọi, retryAfter", () => {
    const error = new AIServiceError("RATE_LIMITED", 2, { retryAfterMs: 98765 });
    const result = toGradingError(error)!;
    expect(Object.keys(result).sort()).toEqual(["code", "message"]);
    expect(result.message).not.toBe(error.message);
    expect(JSON.stringify(result)).not.toContain("98765");
  });

  it("lỗi không phải AI (DB, lỗi lạ, không phải Error) -> null để nơi gọi ném lại như cũ", () => {
    expect(toGradingError(new Error("connection refused"))).toBeNull();
    expect(toGradingError(Object.assign(new Error("x"), { code: "RATE_LIMITED", statusCode: 429 }))).toBeNull();
    expect(toGradingError("RATE_LIMITED")).toBeNull();
    expect(toGradingError(undefined)).toBeNull();
  });
});