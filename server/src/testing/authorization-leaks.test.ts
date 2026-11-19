import { describe, expect, it } from "vitest";
import { expectNoLeaks } from "./authorization-leaks";

describe("quét rò rỉ trong response và log", () => {
  it.each(["passwordHash", "password_hash", "JWT_SECRET", "GEMINI_API_KEY", "stack"])(
    "phát hiện trường %s trong object lồng trong mảng",
    (key) => {
      expect(() => expectNoLeaks({ data: [{ nested: { [key]: null } }] }))
        .toThrow('Forbidden field under $["data"]["0"]["nested"]');
    }
  );

  it.each([
    ["Tên khóa trong thông báo lỗi", "Missing GEMINI_API_KEY", "Private value"],
    ["Đường dẫn Linux", "Cannot open /workspace/app/audio.ogg", "Stack trace or server path"],
    ["Đường dẫn Windows", "Cannot open C:\\server\\audio.ogg", "Stack trace or server path"],
    ["Stack trace", "Error: database failed\n    at query (driver.js:5:4)", "Stack trace or server path"],
  ])("%s", (_name, message, expectedError) => {
    expect(() => expectNoLeaks({ error: { message } })).toThrow(expectedError);
  });

  it("phát hiện giá trị test nhạy cảm mà không in giá trị đó trong lỗi", () => {
    const originalFileName = "t22-original-voice.ogg";
    const checks = { forbiddenValues: ["", originalFileName] };
    const scan = () => expectNoLeaks(["Upload failed", { file: originalFileName }], checks);
    expect(scan).toThrow(/^Private value at \$/);
    expect(scan).not.toThrow(new RegExp(originalFileName));
  });

  it("quét được thuộc tính stack không enumerable trong đối tượng Error", () => {
    expect(() => expectNoLeaks(["logger args", new Error("unexpected error")]))
      .toThrow(/Forbidden field/);
  });

  it("che trường đáp án và phản hồi chấm theo quy tắc của từng ca", () => {
    const checks = { forbiddenKeys: ["answer", "explanation", "correction"] };
    expect(() => expectNoLeaks({ data: { answer: [] } }, checks)).toThrow(/Forbidden field/);
    expect(() => expectNoLeaks({ data: { explanation: null } }, checks)).toThrow(/Forbidden field/);
    expect(() => expectNoLeaks({ data: { errors: [{ correction: "goes" }] } }, checks))
      .toThrow(/Forbidden field/);
    expect(() => expectNoLeaks({ data: { submittedAnswer: ["go"], explanation: "Feedback" } },
      { forbiddenKeys: ["answer"] })).not.toThrow();
  });
});