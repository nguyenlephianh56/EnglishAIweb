import { describe, expect, it } from "vitest";
import { AIProvider, AIProviderError, AIRequest, AIResponse } from "./provider";

describe("AIProviderError", () => {
  it("giữ đúng kind, message, retryAfterMs, cause và instanceof hoạt động", () => {
    const goc = new Error("lỗi gốc từ API");
    const err = new AIProviderError("RATE_LIMITED", "AI đang bận, vui lòng thử lại sau", {
      retryAfterMs: 5000,
      cause: goc,
    });

    expect(err).toBeInstanceOf(AIProviderError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AIProviderError");
    expect(err.kind).toBe("RATE_LIMITED");
    expect(err.message).toBe("AI đang bận, vui lòng thử lại sau");
    expect(err.retryAfterMs).toBe(5000);
    expect(err.cause).toBe(goc);
  });

  it("retryAfterMs và cause là tùy chọn; cause không lộ khi JSON.stringify", () => {
    const err = new AIProviderError("TIMEOUT", "AI trả lời quá lâu", {
      cause: new Error("https://api.example.com?key=BI_MAT"),
    });
    const sauKhiTrongChuoi = JSON.stringify(err);

    expect(new AIProviderError("NETWORK", "Mất kết nối").retryAfterMs).toBeUndefined();
    expect(new AIProviderError("NETWORK", "Mất kết nối").cause).toBeUndefined();
    expect(sauKhiTrongChuoi).not.toContain("BI_MAT");
  });

  it("một provider giả viết theo interface AIProvider biên dịch và chạy được", async () => {
    const mock: AIProvider = {
      name: "mock",
      async generate(req: AIRequest): Promise<AIResponse> {
        return { text: `echo: ${req.prompt}`, model: "mock-1", tokens: { input: 1, output: 2 } };
      },
    };

    const res = await mock.generate({ prompt: "hi", json: false });
    expect(res.text).toBe("echo: hi");
    expect(res.model).toBe("mock-1");
  });
});