import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiProvider } from "./gemini.provider";
import { AIProviderError } from "./provider";
import type { AIRequest } from "./provider";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  create: vi.fn(),
  env: {
    GEMINI_API_KEY: "",
    GEMINI_MODEL: "test-flash",
    AI_TIMEOUT_MS: 1000,
  },
}));

// Thay cả module env: không chạy dotenv hoặc yêu cầu DB/JWT thật.
vi.mock("../config/env", () => ({ env: mocks.env }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    constructor(options: unknown) {
      mocks.create(options);
    }
    models = { generateContent: mocks.generate };
  },
}));

const FAKE_KEY = "fake-key-only-for-unit-test";
const request: AIRequest = { prompt: "Bài viết giả dùng trong test" };
const provider = new GeminiProvider();

function success(text = "Xin chào") {
  return {
    candidates: [{
      finishReason: "STOP",
      content: { parts: [{ text }] },
    }],
    modelVersion: "test-flash-actual",
    usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8 },
  };
}

async function getError(): Promise<AIProviderError> {
  try {
    await provider.generate(request);
  } catch (error) {
    expect(error).toBeInstanceOf(AIProviderError);
    return error as AIProviderError;
  }
  throw new Error("Mong đợi AIProviderError nhưng lời gọi đã thành công");
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.generate.mockReset();
  mocks.create.mockReset();
  mocks.env.GEMINI_API_KEY = FAKE_KEY;
  mocks.env.GEMINI_MODEL = "test-flash";
  mocks.env.AI_TIMEOUT_MS = 1000;
  mocks.generate.mockResolvedValue(success());

  // Chặn mạng nếu vô tình bỏ qua mock SDK.
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Cấm gọi mạng trong test"));
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

afterEach(() => {
  try {
    expect(globalThis.fetch).not.toHaveBeenCalled();
    // Provider hiện không cần log: kiểm chặt để không rò key/prompt/audio/cause.
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      expect(console[method]).not.toHaveBeenCalled();
    }
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  }
});

describe("GeminiProvider", () => {
  it("trả text, tokens và model thực tế; truyền đúng tham số JSON/audio", async () => {
    mocks.generate.mockResolvedValue(success('{"ok":true}'));
    const audio = Buffer.from("âm thanh giả");
    const result = await provider.generate({
      ...request,
      system: "Bạn là giáo viên tiếng Anh",
      json: true,
      temperature: 0,
      maxOutputTokens: 200,
      audio: { mimeType: "audio/wav", data: audio },
    });

    expect(provider.name).toBe("gemini");
    expect(result).toEqual({
      text: '{"ok":true}',
      tokens: { input: 12, output: 8 },
      model: "test-flash-actual",
    });
    expect(mocks.create).toHaveBeenCalledWith({ apiKey: FAKE_KEY });
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledWith({
      model: "test-flash",
      contents: [{ role: "user", parts: [
        { text: request.prompt },
        { inlineData: { mimeType: "audio/wav", data: audio.toString("base64") } },
      ] }],
      config: expect.objectContaining({
        systemInstruction: "Bạn là giáo viên tiếng Anh",
        temperature: 0,
        maxOutputTokens: 200,
        responseMimeType: "application/json",
        abortSignal: expect.any(AbortSignal),
        httpOptions: { retryOptions: { attempts: 1 } },
      }),
    });
  });

  it("không bật JSON khi không yêu cầu; thiếu metadata thì bỏ tokens", async () => {
    mocks.generate.mockResolvedValue({ candidates: success().candidates });
    expect(await provider.generate(request)).toEqual({
      text: "Xin chào", model: "test-flash",
    });
    expect(mocks.generate.mock.calls[0][0].config.responseMimeType).toBeUndefined();
  });

  it("giữ token bằng 0 và không trả phần suy nghĩ nội bộ", async () => {
    mocks.generate.mockResolvedValue({
      ...success(),
      candidates: [{ finishReason: "STOP", content: { parts: [
        { text: "nội bộ", thought: true }, { text: "Xin " }, { text: "chào" },
      ] } }],
      usageMetadata: { promptTokenCount: 0 },
    });
    expect(await provider.generate(request)).toEqual({
      text: "Xin chào", model: "test-flash-actual", tokens: { input: 0 },
    });
  });

  it.each([401, 403])("HTTP %s -> AUTH, lỗi gốc chỉ trong cause", async (status) => {
    const original = Object.assign(new Error(`https://example.test?key=${FAKE_KEY}`), { status });
    mocks.generate.mockRejectedValue(original);
    const error = await getError();
    expect(error.kind).toBe("AUTH");
    expect(error.cause).toBe(original);
    expect(error.message).not.toContain(FAKE_KEY);
    expect(error.message).not.toContain("https://");
    expect(JSON.stringify(error)).not.toContain(FAKE_KEY);
  });

  it.each([
    { headers: { "retry-after": "2" } },
    { response: { headers: new Headers({ "Retry-After": "2" }) } },
    { message: JSON.stringify({ error: { details: [{
      "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "2s",
    }] } }) },
  ])("429 -> RATE_LIMITED và đọc thời gian chờ: %j", async (detail) => {
    mocks.generate.mockRejectedValue({ status: 429, ...detail });
    expect(await getError()).toMatchObject({ kind: "RATE_LIMITED", retryAfterMs: 2000 });
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it("đọc Retry-After dạng ngày HTTP", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    mocks.generate.mockRejectedValue({ status: 429, headers: {
      "Retry-After": "Thu, 01 Jan 2026 00:00:03 GMT",
    } });
    expect(await getError()).toMatchObject({ kind: "RATE_LIMITED", retryAfterMs: 3000 });
  });

  it("429 không có gợi ý thì không tự bịa thời gian chờ", async () => {
    mocks.generate.mockRejectedValue({ status: 429 });
    expect(await getError()).toMatchObject({ kind: "RATE_LIMITED", retryAfterMs: undefined });
  });

  it("hết thời gian -> TIMEOUT và abort, kể cả SDK không phản hồi", async () => {
    mocks.env.AI_TIMEOUT_MS = 50;
    mocks.generate.mockImplementation(() => new Promise(() => {}));
    const pending = getError(); // Bắt rejection trước khi đẩy đồng hồ.
    const signal: AbortSignal = mocks.generate.mock.calls[0][0].config.abortSignal;
    await vi.advanceTimersByTimeAsync(49);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).kind).toBe("TIMEOUT");
    expect(signal.aborted).toBe(true);
  });

  it.each([
    new TypeError("fetch failed"),
    new Error("Lỗi kết nối", { cause: { code: "ECONNRESET" } }),
    { code: "ENOTFOUND" },
  ])("lỗi mạng -> NETWORK: %j", async (original) => {
    mocks.generate.mockRejectedValue(original);
    const error = await getError();
    expect(error.kind).toBe("NETWORK");
    expect(error.cause).toBe(original);
  });

  it.each([
    {},
    success("   "),
    { promptFeedback: { blockReason: "SAFETY" } },
    { candidates: [{ finishReason: "SAFETY", content: { parts: [{ text: "bị chặn" }] } }] },
    { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "bị cắt" }] } }] },
  ])("phản hồi rỗng/bị chặn/chưa đầy đủ -> INVALID_RESPONSE: %j", async (response) => {
    mocks.generate.mockResolvedValue(response);
    expect((await getError()).kind).toBe("INVALID_RESPONSE");
  });

  it.each(["", "   "])("thiếu key (%j) -> AUTH, không khởi tạo SDK", async (key) => {
    mocks.env.GEMINI_API_KEY = key;
    const error = await getError();
    expect(error.kind).toBe("AUTH");
    expect(error.message).toContain("GEMINI_API_KEY");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("lỗi lạ -> UNKNOWN, không lộ key/prompt/audio trong message hoặc JSON lỗi", async () => {
    const sensitive = [FAKE_KEY, request.prompt, "fake-audio-base64"];
    const original = new Error(sensitive.join(" | "));
    mocks.generate.mockRejectedValue(original);
    const error = await getError();
    expect(error.kind).toBe("UNKNOWN");
    expect(error.cause).toBe(original);
    for (const value of sensitive) {
      expect(error.message).not.toContain(value);
      expect(JSON.stringify(error)).not.toContain(value);
    }
  });

  it.each([
    success(FAKE_KEY),
    success("https://example.test?key=another-secret"),
    { ...success(), modelVersion: FAKE_KEY },
  ])("không trả key/URL có key trong response, ca %#", async (response) => {
    mocks.generate.mockResolvedValue(response);
    const error = await getError();
    expect(error.kind).toBe("INVALID_RESPONSE");
    expect(error.message).not.toContain(FAKE_KEY);
    expect(error.message).not.toContain("https://");
  });
});
