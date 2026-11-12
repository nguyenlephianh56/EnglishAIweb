import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  AIInvalidFormatError,
  AI_INVALID_FORMAT_CODE,
  generateJson,
  stripCodeFence,
} from "./json";
import { AIProviderError } from "./provider";
import type { AIProvider, AIRequest, AIResponse } from "./provider";

// Provider giả: mỗi lần generate lấy 1 bước trong danh sách.
// Bước là chuỗi (phản hồi của model) hoặc Error (giả lập provider lỗi).
function fakeProvider(steps: Array<string | Error>) {
  const calls: AIRequest[] = [];
  const provider: AIProvider = {
    name: "mock",
    async generate(req: AIRequest): Promise<AIResponse> {
      calls.push(req);
      const step = steps[calls.length - 1];
      if (step === undefined) throw new Error("Test: provider bị gọi quá số lần dự kiến");
      if (step instanceof Error) throw step;
      return { text: step, model: "mock-1", tokens: { input: 10, output: 5 } };
    },
  };
  return { provider, calls };
}

const schema = z.object({ score: z.number(), comment: z.string() });
const VALID = JSON.stringify({ score: 7, comment: "Tốt" });
const PROMPT = "Hãy chấm bài này";

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warnSpy.mockRestore();
});

describe("generateJson", () => {
  it("lần 1 trả JSON hợp lệ -> trả đúng dữ liệu, provider gọi 1 lần", async () => {
    const { provider, calls } = fakeProvider([VALID]);

    const result = await generateJson(provider, PROMPT, schema);

    expect(result.data).toEqual({ score: 7, comment: "Tốt" });
    expect(result.attempts).toBe(1);
    expect(result.model).toBe("mock-1");
    expect(calls).toHaveLength(1);
    expect(calls[0].json).toBe(true);
    expect(calls[0].prompt).toContain(PROMPT);
    expect(calls[0].prompt).toMatch(/chỉ trả về JSON/i);
  });

  it("lần 1 JSON bọc ```json ``` -> vẫn parse được, gọi 1 lần", async () => {
    const { provider, calls } = fakeProvider(["```json\n" + VALID + "\n```"]);

    const result = await generateJson(provider, PROMPT, schema);

    expect(result.data).toEqual({ score: 7, comment: "Tốt" });
    expect(calls).toHaveLength(1);
  });

  it("lần 1 không phải JSON, lần 2 hợp lệ -> thành công, gọi đúng 2 lần", async () => {
    const { provider, calls } = fakeProvider(["Xin lỗi, đây là nhận xét...", VALID]);

    const result = await generateJson(provider, PROMPT, schema);

    expect(result.data).toEqual({ score: 7, comment: "Tốt" });
    expect(result.attempts).toBe(2);
    expect(calls).toHaveLength(2);
  });

  it("lần 1 JSON đúng cú pháp nhưng sai schema (thiếu field / sai kiểu), lần 2 hợp lệ -> gọi 2 lần", async () => {
    const thieuField = JSON.stringify({ score: 7 });
    const saiKieu = JSON.stringify({ score: "bảy", comment: "Tốt" });

    for (const lan1 of [thieuField, saiKieu]) {
      const { provider, calls } = fakeProvider([lan1, VALID]);

      const result = await generateJson(provider, PROMPT, schema);

      expect(result.data).toEqual({ score: 7, comment: "Tốt" });
      expect(calls).toHaveLength(2);
    }
  });

  it("cả 2 lần sai -> ném AI_INVALID_FORMAT, gọi đúng 2 lần, không chứa nội dung thô", async () => {
    const RAW = "NOI_DUNG_THO_BI_MAT";
    const { provider, calls } = fakeProvider([
      `{"score": "${RAW}"}`,
      `không phải json ${RAW}`,
      VALID, // nếu lỡ gọi lần 3 thì sẽ thành công -> test phải bắt được
    ]);

    const error = await generateJson(provider, PROMPT, schema).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AIInvalidFormatError);
    const err = error as AIInvalidFormatError;
    expect(err.code).toBe(AI_INVALID_FORMAT_CODE);
    expect(err.code).toBe("AI_INVALID_FORMAT");
    expect(err.statusCode).toBe(502);
    expect(err.attempts).toBe(2);
    expect(calls).toHaveLength(2);
    expect(err.message).toMatch(/định dạng/);
    expect(err.message).not.toContain(RAW);
    expect(JSON.stringify(err)).not.toContain(RAW);
    expect(err.cause).toBeUndefined();
  });

  it("provider ném lỗi (mạng) -> đi thẳng ra, KHÔNG retry", async () => {
    const loiMang = new AIProviderError("NETWORK", "Mất kết nối");
    const { provider, calls } = fakeProvider([loiMang, VALID]);

    const error = await generateJson(provider, PROMPT, schema).catch((e: unknown) => e);

    expect(error).toBe(loiMang);
    expect(calls).toHaveLength(1);
  });

  it("lần 1 sai định dạng, lần 2 provider lỗi -> lỗi provider đi thẳng ra, không gọi lần 3", async () => {
    const loi429 = new AIProviderError("RATE_LIMITED", "Giới hạn lượt", { retryAfterMs: 3000 });
    const { provider, calls } = fakeProvider(["không phải json", loi429, VALID]);

    const error = await generateJson(provider, PROMPT, schema).catch((e: unknown) => e);

    expect(error).toBe(loi429);
    expect(calls).toHaveLength(2);
  });

  it("retry: prompt lần 2 có nhắc lỗi, không kèm phản hồi sai; log không chứa prompt/nội dung thô", async () => {
    const RAW = "NOI_DUNG_THO_BI_MAT";
    const SECRET_PROMPT = "BAI_LAM_CUA_HOC_SINH_BI_MAT";
    const enumSchema = z.object({ level: z.enum(["A1", "B2"]) });
    // Zod v3 báo "received '<giá trị>'" trong message -> câu nhắc không được dùng message.
    const { provider, calls } = fakeProvider([JSON.stringify({ level: RAW }), JSON.stringify({ level: "B2" })]);

    const result = await generateJson(provider, SECRET_PROMPT, enumSchema, {
      schemaName: "level-test",
    });

    expect(result.data).toEqual({ level: "B2" });
    expect(calls).toHaveLength(2);

    // Lần 1 chưa có câu nhắc; lần 2 có nhắc + vẫn có prompt gốc.
    expect(calls[0].prompt).not.toContain("Lần trước phản hồi sai định dạng");
    expect(calls[1].prompt).toContain("Lần trước phản hồi sai định dạng");
    expect(calls[1].prompt).toContain("level");
    expect(calls[1].prompt).toContain(SECRET_PROMPT);
    expect(calls[1].prompt).not.toContain(RAW);

    // Log chỉ có tên schema, số lần thử, lý do.
    const log = JSON.stringify(warnSpy.mock.calls);
    expect(log).toContain("level-test");
    expect(log).toContain("attempt=1/2");
    expect(log).not.toContain(SECRET_PROMPT);
    expect(log).not.toContain(RAW);
  });

  it("cộng token của các lần gọi và truyền các tùy chọn cho provider", async () => {
    const { provider, calls } = fakeProvider(["không phải json", VALID]);

    const result = await generateJson(provider, PROMPT, schema, {
      system: "Bạn là giáo viên",
      temperature: 0.2,
      maxOutputTokens: 500,
    });

    expect(result.tokens).toEqual({ input: 20, output: 10 });
    expect(calls[0]).toMatchObject({ system: "Bạn là giáo viên", temperature: 0.2, maxOutputTokens: 500, json: true });
  });
});

describe("stripCodeFence", () => {
  it("bóc rào có/không ghi json; giữ nguyên khi không bọc trọn", () => {
    expect(stripCodeFence("```json\n{\"a\":1}\n```")).toBe("{\"a\":1}");
    expect(stripCodeFence("```\n{\"a\":1}\n```")).toBe("{\"a\":1}");
    expect(stripCodeFence("  {\"a\":1}  ")).toBe("{\"a\":1}");
    expect(stripCodeFence("Đây là kết quả: ```json\n{\"a\":1}\n```")).toContain("Đây là kết quả");
  });
});