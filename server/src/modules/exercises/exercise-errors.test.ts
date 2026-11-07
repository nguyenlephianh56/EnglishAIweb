import { describe, it, expect, vi } from "vitest";
import type { Response } from "express";
import {
  formatValidationErrors,
  sendExerciseValidationError,
  EXERCISE_VALIDATION_ERROR_CODE,
  MAX_ERRORS_IN_MESSAGE,
} from "./exercise-errors";
import { validateExercise } from "./validate-exercise";

/** Response giả: ghi lại status và json được gọi. */
function mockResponse() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

describe("formatValidationErrors", () => {
  it("một lỗi: 'đường_dẫn: thông báo'", () => {
    expect(
      formatValidationErrors([{ path: "content.text", message: "Không được để trống" }])
    ).toBe("content.text: Không được để trống");
  });

  it("nhiều lỗi: ngăn cách bằng '; '", () => {
    const text = formatValidationErrors([
      { path: "content.text", message: "A" },
      { path: "answer[0]", message: "B" },
    ]);
    expect(text).toBe("content.text: A; answer[0]: B");
  });

  it("quá nhiều lỗi: cắt bớt và ghi số lỗi còn lại", () => {
    const errors = Array.from({ length: MAX_ERRORS_IN_MESSAGE + 3 }, (_, i) => ({
      path: `answer[${i}]`,
      message: "Sai",
    }));
    const text = formatValidationErrors(errors);
    expect(text.split("; ")).toHaveLength(MAX_ERRORS_IN_MESSAGE + 1);
    expect(text.endsWith("(và 3 lỗi khác)")).toBe(true);
  });

  it("danh sách rỗng: trả thông báo chung, không bị chuỗi rỗng", () => {
    expect(formatValidationErrors([])).toContain("không hợp lệ");
  });
});

describe("sendExerciseValidationError", () => {
  it("trả HTTP 400 với khuôn { data: null, error: { code, message } }", () => {
    const res = mockResponse();
    sendExerciseValidationError(res, [{ path: "type", message: "Dạng bài không hợp lệ" }]);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      data: null,
      error: {
        code: EXERCISE_VALIDATION_ERROR_CODE,
        message: "type: Dạng bài không hợp lệ",
      },
    });
    expect(EXERCISE_VALIDATION_ERROR_CODE).toBe("VALIDATION_ERROR");
  });

  it("kết hợp với validateExercise: message chứa path field và tiếng Việt", () => {
    const result = validateExercise(
      "fill_blank",
      { text: "I ___ a ___." },
      ["am"]
    );
    expect(result.success).toBe(false);
    if (result.success) return;

    const res = mockResponse();
    sendExerciseValidationError(res, result.errors);

    const body = res.json.mock.calls[0][0];
    expect(res.status).toHaveBeenCalledWith(400);
    expect(body.data).toBeNull();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("answer:");
    expect(body.error.message).toContain("chỗ trống");
  });

  it("nhiều lỗi ở content và answer: message có cả hai đường dẫn", () => {
    const result = validateExercise("matching", { left: ["a"], right: ["b"] }, "x");
    expect(result.success).toBe(false);
    if (result.success) return;

    const res = mockResponse();
    sendExerciseValidationError(res, result.errors);
    const message: string = res.json.mock.calls[0][0].error.message;
    expect(message).toContain("content.left:");
    expect(message).toContain("answer:");
  });
});