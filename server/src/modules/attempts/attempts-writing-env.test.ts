import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Không đọc file .env thật của máy: test chỉ dựa vào process.env do test tự đặt.
vi.mock("dotenv/config", () => ({}));

const KEYS = ["WRITING_MAX_WORDS", "WRITING_MAX_CHARS"] as const;
const saved: Record<string, string | undefined> = {};

// env.ts parse ngay khi import -> import lại sau mỗi lần đổi process.env.
const loadEnv = async () => {
  vi.resetModules();
  return (await import("../../config/env")).env;
};

describe("env: giới hạn bài Viết", () => {
  beforeEach(() => {
    for (const k of [...KEYS, "DATABASE_URL", "JWT_SECRET"]) saved[k] = process.env[k];
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
    process.env.JWT_SECRET = "test-secret-test-secret";
    for (const k of KEYS) delete process.env[k];
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.restoreAllMocks();
  });

  it("thiếu biến -> dùng mặc định 600 từ / 4000 ký tự", async () => {
    const env = await loadEnv();
    expect(env.WRITING_MAX_WORDS).toBe(600);
    expect(env.WRITING_MAX_CHARS).toBe(4000);
  });

  it("để trống -> dùng mặc định", async () => {
    process.env.WRITING_MAX_WORDS = "";
    process.env.WRITING_MAX_CHARS = "  ";
    const env = await loadEnv();
    expect(env.WRITING_MAX_WORDS).toBe(600);
    expect(env.WRITING_MAX_CHARS).toBe(4000);
  });

  it("đặt giá trị hợp lệ -> dùng giá trị đó (kiểu số)", async () => {
    process.env.WRITING_MAX_WORDS = "800";
    process.env.WRITING_MAX_CHARS = "6000";
    const env = await loadEnv();
    expect(env.WRITING_MAX_WORDS).toBe(800);
    expect(env.WRITING_MAX_CHARS).toBe(6000);
  });

  it.each([
    ["WRITING_MAX_WORDS", "0"],
    ["WRITING_MAX_WORDS", "abc"],
    ["WRITING_MAX_CHARS", "-1"],
    ["WRITING_MAX_CHARS", "30001"], // vượt trần cứng của Zod
  ])("%s=%s không hợp lệ -> dừng khởi động", async (key, value) => {
    process.env[key] = value;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);
    await expect(loadEnv()).rejects.toThrow("process.exit");
  });
});