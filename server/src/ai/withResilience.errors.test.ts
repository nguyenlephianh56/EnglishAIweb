import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { generateJson } from "./json";
import { AIProviderError } from "./provider";
import type { AIProvider, AIRequest, AIResponse } from "./provider";
import { AIServiceError, withResilience } from "./resilience";

const request: AIRequest = { prompt: "Bài viết giả của học sinh" };
const ok = (text = "xin chào"): AIResponse => ({ text, model: "fake" });

const providerError = (
  kind: ConstructorParameters<typeof AIProviderError>[0],
  cause?: unknown
) => new AIProviderError(kind, "thông báo từ provider", { cause });

function fakeProvider(steps: Array<AIResponse | Error>) {
  const generate = vi.fn(async (_req: AIRequest): Promise<AIResponse> => {
    const step = steps.shift();
    if (step === undefined) throw new Error("hết kịch bản test");
    if (step instanceof Error) throw step;
    return step;
  });
  const provider: AIProvider = { name: "fake", generate };
  return { provider, generate };
}

const defaults = {
  retry429Max: 1,
  retry429DelayMs: 3000,
  retryNetworkMax: 1,
  retryNetworkDelayMs: 2000,
};

async function getError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Mong đợi lỗi nhưng lời gọi đã thành công");
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("withResilience - timeout", () => {
  it("TIMEOUT -> ném TIMEOUT (504), KHÔNG thử lại, không chờ", async () => {
    const { provider, generate } = fakeProvider([providerError("TIMEOUT"), ok()]);
    const sleep = vi.fn(async () => {});
    const error = await getError(withResilience(provider, { ...defaults, sleep }).generate(request));
    expect(error).toBeInstanceOf(AIServiceError);
    expect(error).toMatchObject({ code: "TIMEOUT", statusCode: 504, attempts: 1 });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("429 rồi TIMEOUT -> dừng ngay ở TIMEOUT, attempts = 2", async () => {
    const { provider, generate } = fakeProvider([
      providerError("RATE_LIMITED"), providerError("TIMEOUT"), ok(),
    ]);
    const error = await getError(
      withResilience(provider, { ...defaults, sleep: async () => {} }).generate(request)
    );
    expect(error).toMatchObject({ code: "TIMEOUT", attempts: 2 });
    expect(generate).toHaveBeenCalledTimes(2);
  });
});

describe("withResilience - lỗi mạng", () => {
  it("lỗi mạng lần 1, thành công lần 2 -> trả kết quả, chờ đúng 2 giây", async () => {
    const { provider, generate } = fakeProvider([providerError("NETWORK"), ok("lần 2")]);
    const sleep = vi.fn(async () => {});
    const result = await withResilience(provider, { ...defaults, sleep }).generate(request);
    expect(result.text).toBe("lần 2");
    expect(generate).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("lỗi mạng hết lượt -> AI_UNAVAILABLE (502), gọi đúng 2 lần", async () => {
    const { provider, generate } = fakeProvider([providerError("NETWORK"), providerError("NETWORK"), ok()]);
    const sleep = vi.fn(async () => {});
    const error = await getError(withResilience(provider, { ...defaults, sleep }).generate(request));
    expect(error).toBeInstanceOf(AIServiceError);
    expect(error).toMatchObject({ code: "AI_UNAVAILABLE", statusCode: 502, attempts: 2 });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("retryNetworkMax = 0 -> không thử lại", async () => {
    const { provider, generate } = fakeProvider([providerError("NETWORK"), ok()]);
    const sleep = vi.fn(async () => {});
    const error = await getError(
      withResilience(provider, { ...defaults, retryNetworkMax: 0, sleep }).generate(request)
    );
    expect(error).toMatchObject({ code: "AI_UNAVAILABLE", attempts: 1 });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("thời gian chờ mạng cấu hình quá lớn -> bị chặn ở trần 10 giây", async () => {
    const { provider } = fakeProvider([providerError("NETWORK"), ok()]);
    const sleep = vi.fn(async () => {});
    await withResilience(provider, { ...defaults, retryNetworkDelayMs: 60_000, sleep }).generate(request);
    expect(sleep).toHaveBeenCalledWith(10_000);
  });

  it("429 và lỗi mạng đếm lượt thử lại riêng: 429 -> mạng -> thành công = 3 lần gọi", async () => {
    const { provider, generate } = fakeProvider([
      providerError("RATE_LIMITED"), providerError("NETWORK"), ok("xong"),
    ]);
    const sleep = vi.fn(async (_ms: number) => {});
    const result = await withResilience(provider, { ...defaults, sleep }).generate(request);
    expect(result.text).toBe("xong");
    expect(generate).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([3000, 2000]);
  });
});

describe("withResilience - lỗi khác", () => {
  it.each(["AUTH", "UNKNOWN"] as const)(
    "%s -> AI_ERROR (502), không thử lại, không lộ key/URL/prompt trong lỗi và log",
    async (kind) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const secrets = ["khoa-bi-mat-123", "https://api.test/x?key=khoa-bi-mat-123", request.prompt];
      const cause = new Error(secrets.join(" | "));
      const { provider, generate } = fakeProvider([providerError(kind, cause), ok()]);
      const sleep = vi.fn(async () => {});

      const error = (await getError(
        withResilience(provider, { ...defaults, sleep }).generate(request)
      )) as AIServiceError;

      expect(error).toBeInstanceOf(AIServiceError);
      expect(error).toMatchObject({ code: "AI_ERROR", statusCode: 502, attempts: 1 });
      expect(error.cause).toBeUndefined();
      expect(generate).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();

      const logged = warn.mock.calls.map((call) => call.join(" ")).join("\n");
      for (const secret of secrets) {
        expect(error.message).not.toContain(secret);
        expect(JSON.stringify(error)).not.toContain(secret);
        expect(logged).not.toContain(secret);
      }
    }
  );

  it("INVALID_RESPONSE -> ném lại nguyên vẹn (giữ hành vi cũ), không thử lại", async () => {
    const original = providerError("INVALID_RESPONSE");
    const { provider, generate } = fakeProvider([original, ok()]);
    const error = await getError(withResilience(provider, defaults).generate(request));
    expect(error).toBe(original);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("provider ném lỗi lạ không phải AIProviderError -> AI_ERROR, không lộ nội dung", async () => {
    const { provider, generate } = fakeProvider([new Error("khoa-bi-mat-123 chi tiết nội bộ")]);
    const error = (await getError(withResilience(provider, defaults).generate(request))) as AIServiceError;
    expect(error).toMatchObject({ code: "AI_ERROR", attempts: 1 });
    expect(JSON.stringify(error) + error.message).not.toContain("khoa-bi-mat-123");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("AIServiceError sẵn có (bọc nhiều lớp) -> giữ nguyên", async () => {
    const original = new AIServiceError("TIMEOUT", 1);
    const { provider } = fakeProvider([original]);
    expect(await getError(withResilience(provider, defaults).generate(request))).toBe(original);
  });
});

describe("withResilience + generateJson: lỗi hạ tầng không bị retry định dạng", () => {
  const schema = z.object({ a: z.number() });
  const json = (text: string): AIResponse => ({ text, model: "fake" });

  it.each([
    ["TIMEOUT", [providerError("TIMEOUT")], "TIMEOUT", 1],
    ["NETWORK hết lượt", [providerError("NETWORK"), providerError("NETWORK")], "AI_UNAVAILABLE", 2],
    ["AUTH", [providerError("AUTH")], "AI_ERROR", 1],
  ] as const)("%s -> AIServiceError %s, không gọi thêm lần định dạng", async (_name, steps, code, calls) => {
    const { provider, generate } = fakeProvider([...steps, json('{"a":1}')]);
    const wrapped = withResilience(provider, { ...defaults, sleep: async () => {} });
    const error = await getError(generateJson(wrapped, "đề", schema));
    expect(error).toBeInstanceOf(AIServiceError);
    expect(error).toMatchObject({ code });
    expect(generate).toHaveBeenCalledTimes(calls);
  });

  it("lỗi mạng rồi thành công bên trong 1 lượt định dạng -> attempts định dạng vẫn là 1", async () => {
    const { provider, generate } = fakeProvider([providerError("NETWORK"), json('{"a":1}')]);
    const wrapped = withResilience(provider, { ...defaults, sleep: async () => {} });
    const result = await generateJson(wrapped, "đề", schema);
    expect(result.attempts).toBe(1);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});