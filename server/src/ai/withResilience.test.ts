import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { generateJson } from "./json";
import { AIProviderError } from "./provider";
import type { AIProvider, AIRequest, AIResponse } from "./provider";
import { AIServiceError, MAX_RETRY_AFTER_MS, withResilience } from "./resilience";

const request: AIRequest = { prompt: "Bài viết giả của học sinh" };
const ok = (text = "xin chào"): AIResponse => ({ text, model: "fake" });

const rateLimited = (retryAfterMs?: number, cause?: unknown) =>
  new AIProviderError("RATE_LIMITED", "giới hạn lượt", { retryAfterMs, cause });

/** Provider giả: mỗi lần gọi lấy 1 phần tử trong danh sách (lỗi thì ném, kết quả thì trả). */
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

// Tắt log trong test cho gọn (test về log vẫn tự spy lại và kiểm nội dung).
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("withResilience - 429", () => {
  it("thành công ngay -> trả kết quả, gọi 1 lần, không chờ", async () => {
    const { provider, generate } = fakeProvider([ok()]);
    const sleep = vi.fn(async () => {});
    const result = await withResilience(provider, { ...defaults, sleep }).generate(request);
    expect(result).toEqual(ok());
    expect(generate).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("giữ nguyên name của provider và truyền nguyên request", async () => {
    const { provider, generate } = fakeProvider([ok()]);
    const wrapped = withResilience(provider, defaults);
    expect(wrapped.name).toBe("fake");
    await wrapped.generate(request);
    expect(generate).toHaveBeenCalledWith(request);
  });

  it("429 lần 1 (không gợi ý), thành công lần 2 -> chờ đúng thời gian mặc định", async () => {
    const { provider, generate } = fakeProvider([rateLimited(), ok("lần 2")]);
    const sleep = vi.fn(async () => {});
    const result = await withResilience(provider, { ...defaults, sleep }).generate(request);
    expect(result.text).toBe("lần 2");
    expect(generate).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it("429 có Retry-After -> chờ theo gợi ý, không theo mặc định", async () => {
    const { provider } = fakeProvider([rateLimited(2000), ok()]);
    const sleep = vi.fn(async () => {});
    await withResilience(provider, { ...defaults, sleep }).generate(request);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("gợi ý đúng bằng trần 10 giây -> vẫn chờ", async () => {
    const { provider } = fakeProvider([rateLimited(MAX_RETRY_AFTER_MS), ok()]);
    const sleep = vi.fn(async () => {});
    await withResilience(provider, { ...defaults, sleep }).generate(request);
    expect(sleep).toHaveBeenCalledWith(10_000);
  });

  it("gợi ý vượt trần -> không chờ, không thử lại, ném RATE_LIMITED kèm retryAfterMs", async () => {
    const { provider, generate } = fakeProvider([rateLimited(30_000), ok()]);
    const sleep = vi.fn(async () => {});
    const error = await getError(withResilience(provider, { ...defaults, sleep }).generate(request));
    expect(error).toBeInstanceOf(AIServiceError);
    expect(error).toMatchObject({
      code: "RATE_LIMITED", statusCode: 429, attempts: 1, retryAfterMs: 30_000,
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("thời gian chờ mặc định cấu hình quá lớn -> bị chặn ở trần 10 giây", async () => {
    const { provider } = fakeProvider([rateLimited(), ok()]);
    const sleep = vi.fn(async () => {});
    await withResilience(provider, {retry429Max: 1,retry429DelayMs: 60_000,retryNetworkMax: 1,retryNetworkDelayMs: 2000,sleep,}).generate(request);
    expect(sleep).toHaveBeenCalledWith(10_000);
  });

  it("429 liên tiếp hết lượt -> RATE_LIMITED, gọi đúng 2 lần, message 'thử lại sau'", async () => {
    const { provider, generate } = fakeProvider([rateLimited(), rateLimited(1500)]);
    const sleep = vi.fn(async () => {});
    const error = await getError(withResilience(provider, { ...defaults, sleep }).generate(request));
    expect(error).toBeInstanceOf(AIServiceError);
    expect(error).toMatchObject({
      code: "RATE_LIMITED", statusCode: 429, attempts: 2, retryAfterMs: 1500,
    });
    expect((error as Error).message).toContain("thử lại sau");
    expect(generate).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("retry429Max = 0 -> không thử lại, không chờ", async () => {
    const { provider, generate } = fakeProvider([rateLimited(), ok()]);
    const sleep = vi.fn(async () => {});
    const error = await getError(
      withResilience(provider, {retry429Max: 0,retry429DelayMs: 60_000,retryNetworkMax: 1,retryNetworkDelayMs: 2000,sleep,}).generate(request)
    );
    expect(error).toMatchObject({ code: "RATE_LIMITED", attempts: 1 });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retry429Max = 2 -> tối đa 3 lần gọi, chờ 2 lần", async () => {
    const { provider, generate } = fakeProvider([rateLimited(), rateLimited(), rateLimited()]);
    const sleep = vi.fn(async () => {});
    const error = await getError(
      withResilience(provider, {retry429Max: 2,retry429DelayMs: 60_000,retryNetworkMax: 1,retryNetworkDelayMs: 2000,sleep, }).generate(request)
    );
    expect(error).toMatchObject({ code: "RATE_LIMITED", attempts: 3 });
    expect(generate).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("không truyền sleep -> dùng timer thật (kiểm bằng timer giả), chờ đúng 3 giây", async () => {
    vi.useFakeTimers();
    const { provider, generate } = fakeProvider([rateLimited(), ok("sau chờ")]);
    const pending = withResilience(provider, defaults).generate(request);
    await vi.advanceTimersByTimeAsync(2999);
    expect(generate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).text).toBe("sau chờ");
    expect(generate).toHaveBeenCalledTimes(2);
  });

 it("lỗi AUTH -> chuyển thành AI_ERROR, không thử lại, không chờ", async () => {
  const original = new AIProviderError("AUTH", "sai key");
  const { provider, generate } = fakeProvider([original, ok()]);
  const sleep = vi.fn(async () => {});

  const error = await getError(
    withResilience(provider, { ...defaults, sleep }).generate(request)
  );

  expect(error).toBeInstanceOf(AIServiceError);
  expect(error).toMatchObject({
    code: "AI_ERROR",
    statusCode: 502,
    attempts: 1,
  });

  expect((error as Error).message).not.toContain("sai key");
  expect(generate).toHaveBeenCalledTimes(1);
  expect(sleep).not.toHaveBeenCalled();
});

  it("lỗi và log không chứa key/prompt/lỗi gốc", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const secrets = ["khoa-bi-mat-123", request.prompt];
    const cause = new Error(`${secrets[0]} ${secrets[1]}`);
    const { provider } = fakeProvider([rateLimited(undefined, cause), rateLimited(undefined, cause)]);
    const error = (await getError(
      withResilience(provider, { ...defaults, sleep: async () => {} }).generate(request)
    )) as AIServiceError;

    const logged = warn.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toContain("RATE_LIMITED");
    for (const secret of secrets) {
      expect(error.message).not.toContain(secret);
      expect(JSON.stringify(error)).not.toContain(secret);
      expect(error.cause).toBeUndefined();
      expect(logged).not.toContain(secret);
    }
  });
});

describe("withResilience + generateJson", () => {
  const schema = z.object({ a: z.number() });
  const json = (text: string): AIResponse => ({ text, model: "fake" });

  it("429 rồi thành công bên trong 1 lượt định dạng -> attempts định dạng vẫn là 1", async () => {
    const { provider, generate } = fakeProvider([rateLimited(), json('{"a":1}')]);
    const wrapped = withResilience(provider, { ...defaults, sleep: async () => {} });
    const result = await generateJson(wrapped, "đề", schema);
    expect(result.data).toEqual({ a: 1 });
    expect(result.attempts).toBe(1);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("429 hết lượt đi thẳng ra ngoài generateJson, KHÔNG bị retry định dạng", async () => {
    const { provider, generate } = fakeProvider([rateLimited(), rateLimited(), json('{"a":1}')]);
    const wrapped = withResilience(provider, { ...defaults, sleep: async () => {} });
    const error = await getError(generateJson(wrapped, "đề", schema));
    expect(error).toBeInstanceOf(AIServiceError);
    expect(error).toMatchObject({ code: "RATE_LIMITED" });
    expect(generate).toHaveBeenCalledTimes(2); // 1 + 1 lần thử lại 429, không có lần 3
  });

  it("lỗi định dạng vẫn retry đúng 1 lần như cũ", async () => {
    const { provider, generate } = fakeProvider([json("không phải json"), json('{"a":2}')]);
    const wrapped = withResilience(provider, { ...defaults, sleep: async () => {} });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await generateJson(wrapped, "đề", schema);
    expect(result.data).toEqual({ a: 2 });
    expect(result.attempts).toBe(2);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});