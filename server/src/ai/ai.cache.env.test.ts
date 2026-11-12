import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Không nạp .env thật của máy: test này tự quyết biến nào có/không.
vi.mock("dotenv/config", () => ({}));

const CACHE_KEYS = ["AI_CACHE_TTL_SECONDS", "AI_CACHE_MAX_ENTRIES", "AI_CACHE_TASKS"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of [...CACHE_KEYS, "DATABASE_URL", "JWT_SECRET"]) saved[k] = process.env[k];
  for (const k of CACHE_KEYS) delete process.env[k];
  process.env.DATABASE_URL = "postgresql://test";
  process.env.JWT_SECRET = "0123456789abcdef0123";
  vi.resetModules();
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

const loadEnv = async () => (await import("../config/env")).env;

describe("env.ts - biến cache AI", () => {
  it("thiếu cả 3 biến -> dùng giá trị mặc định", async () => {
    const env = await loadEnv();
    expect(env.AI_CACHE_TTL_SECONDS).toBe(86400);
    expect(env.AI_CACHE_MAX_ENTRIES).toBe(500);
    expect(env.AI_CACHE_TASKS).toBe("grade_writing,grade_speaking,analysis,path");

  });

  it("để trống (\"\") -> cũng dùng mặc định", async () => {
    for (const k of CACHE_KEYS) process.env[k] = "";
    const env = await loadEnv();
    expect(env.AI_CACHE_TTL_SECONDS).toBe(86400);
    expect(env.AI_CACHE_MAX_ENTRIES).toBe(500);
    expect(env.AI_CACHE_TASKS).toBe("grade_writing,grade_speaking,analysis,path");
  });

  it("đặt giá trị -> dùng giá trị đó (0 = tắt cache là hợp lệ)", async () => {
    process.env.AI_CACHE_TTL_SECONDS = "0";
    process.env.AI_CACHE_MAX_ENTRIES = "10";
    process.env.AI_CACHE_TASKS = " analysis,path ";
    const env = await loadEnv();
    expect(env.AI_CACHE_TTL_SECONDS).toBe(0);
    expect(env.AI_CACHE_MAX_ENTRIES).toBe(10);
    expect(env.AI_CACHE_TASKS).toBe("analysis,path");
  });

  it.each([
    ["AI_CACHE_TTL_SECONDS", "abc"],
    ["AI_CACHE_TTL_SECONDS", "-1"],
    ["AI_CACHE_MAX_ENTRIES", "1.5"],
    ["AI_CACHE_MAX_ENTRIES", "999999999"],
  ])("%s=%s -> báo lỗi cấu hình và dừng", async (key, value) => {
    process.env[key] = value;
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(loadEnv()).rejects.toThrow("process.exit");

    expect(exit).toHaveBeenCalledWith(1);
  });
});