import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_SERVICE_ERRORS, AIServiceError } from "./resilience";
import type { AIServiceErrorCode } from "./resilience";

describe("AIServiceError", () => {
  it.each([
    ["RATE_LIMITED", 429],
    ["TIMEOUT", 504],
    ["AI_UNAVAILABLE", 502],
    ["AI_ERROR", 502],
  ] as [AIServiceErrorCode, number][])("%s -> HTTP %i, message tiếng Việt", (code, status) => {
    const error = new AIServiceError(code, 2, { retryAfterMs: 5000 });
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(code);
    expect(error.statusCode).toBe(status);
    expect(error.attempts).toBe(2);
    expect(error.retryAfterMs).toBe(5000);
    expect(error.message).toBe(AI_SERVICE_ERRORS[code].message);
  });

  it("RATE_LIMITED báo 'thử lại sau'; không có cause, JSON không lộ gì ngoài thông tin chuẩn", () => {
    const error = new AIServiceError("RATE_LIMITED", 2);
    expect(error.message).toContain("thử lại sau");
    expect(error.cause).toBeUndefined();
    expect(error.retryAfterMs).toBeUndefined();
    expect(Object.keys(JSON.parse(JSON.stringify(error))).sort()).toEqual(
      ["attempts", "code", "name", "statusCode"]
    );
  });
});

// ---- Giá trị mặc định của biến .env mới (không cần .env thật) ----
const NEW_VARS = [
  "AI_RETRY_429_MAX",
  "AI_RETRY_429_DELAY_MS",
  "AI_RETRY_NETWORK_MAX",
  "AI_RETRY_NETWORK_DELAY_MS",
] as const;

async function loadEnv(overrides: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgresql://test");
  vi.stubEnv("JWT_SECRET", "chuoi-test-du-dai-16-ky-tu");
  // dotenv không ghi đè biến đã có: đặt "" để mô phỏng .env thiếu/để trống biến.
  for (const name of NEW_VARS) vi.stubEnv(name, "");
  for (const [name, value] of Object.entries(overrides)) vi.stubEnv(name, value);
  return (await import("../config/env")).env;
}

describe("env: biến retry AI", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("thiếu/để trống -> dùng mặc định (1 lần, 3000ms; mạng 1 lần, 2000ms)", async () => {
    const env = await loadEnv();
    expect(env.AI_RETRY_429_MAX).toBe(1);
    expect(env.AI_RETRY_429_DELAY_MS).toBe(3000);
    expect(env.AI_RETRY_NETWORK_MAX).toBe(1);
    expect(env.AI_RETRY_NETWORK_DELAY_MS).toBe(2000);
  });

  it("đọc đúng giá trị cấu hình, cho phép 0 để tắt retry", async () => {
    const env = await loadEnv({
      AI_RETRY_429_MAX: "0",
      AI_RETRY_429_DELAY_MS: "500",
      AI_RETRY_NETWORK_MAX: "2",
      AI_RETRY_NETWORK_DELAY_MS: "100",
    });
    expect(env.AI_RETRY_429_MAX).toBe(0);
    expect(env.AI_RETRY_429_DELAY_MS).toBe(500);
    expect(env.AI_RETRY_NETWORK_MAX).toBe(2);
    expect(env.AI_RETRY_NETWORK_DELAY_MS).toBe(100);
  });
});