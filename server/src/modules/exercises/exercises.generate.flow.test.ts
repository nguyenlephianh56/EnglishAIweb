import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import express from "express";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { Prisma, Role, UserStatus } from "@prisma/client";

/**
 * T11 – test LUỒNG sinh bài rồi lưu (mock AI + mock Prisma, không gọi AI thật, không cần DB).
 * Mock `runAiTask` (lớp AI) và `prisma.exercise.create`; phần còn lại chạy thật:
 * route, quyền, Zod, generateExerciseDraft, saveGeneratedDraft, controller, errorHandler.
 * Việc "AI thành công thì ghi ai_usage_logs ok" thuộc lớp AI (đã có test T9), không kiểm ở đây.
 */

const fake = vi.hoisted(() => ({
  jwtSecret: "generate-flow-test-only-secret",
  findUser: vi.fn(),
  createExercise: vi.fn(),
  runAiTask: vi.fn(),
  buildPrompt: vi.fn(),
}));

vi.mock("../../config/env", () => ({
  env: {
    JWT_SECRET: fake.jwtSecret,
    AI_DAILY_LIMIT_STUDENT: 10,
    AI_DAILY_LIMIT_TEACHER: 50,
  },
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    user: { findUnique: fake.findUser },
    exercise: { create: fake.createExercise },
  },
}));

vi.mock("../../ai/ai.service", () => ({ runAiTask: fake.runAiTask }));

vi.mock("../../ai/gemini.provider", () => {
  throw new Error("Test flow không được nạp provider thật");
});

vi.mock("../../ai/prompts/prompt-templates", () => ({
  buildPrompt: fake.buildPrompt,
}));

// Quota đã có test riêng (exercises.generate.api.test.ts): ở đây cho đi qua.
vi.mock("../../middlewares/aiRateLimit", () => ({
  aiRateLimit:
    () => (_req: unknown, _res: unknown, next: () => void) =>
      next(),
}));

import { exerciseRoutes } from "./exercises.routes";
import { errorHandler } from "../../middlewares/errorHandler";
import { AIInvalidFormatError } from "../../ai/json";
import { AIServiceError } from "../../ai/resilience";
import { AIQuotaExceededError, AIUsageCheckError } from "../../ai/ai.types";

const users: Record<number, { id: number; role: Role; status: UserStatus }> = {
  1: { id: 1, role: Role.STUDENT, status: UserStatus.ACTIVE },
  4: { id: 4, role: Role.TEACHER, status: UserStatus.ACTIVE },
  5: { id: 5, role: Role.ADMIN, status: UserStatus.ACTIVE },
};

const mcBody = (overrides: Record<string, unknown> = {}) => ({
  skill: "READING",
  level: "A1",
  topic: "  Daily routines  ", // có khoảng trắng: Zod trim thành "Daily routines"
  type: "multiple_choice",
  count: 1,
  ...overrides,
});

// Bài AI "đã hợp lệ". topic cố ý KHÁC đầu vào để chứng minh server lưu topic theo đầu vào.
const mcDraft = {
  type: "multiple_choice",
  skill: "READING",
  level: "A1",
  topic: "AI tự đổi chủ đề",
  content: { questions: [{ q: "Q1", options: ["a", "b"] }] },
  answer: [1],
  explanation: "Giải thích mẫu",
};

let server: Server | undefined;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/exercises", exerciseRoutes);
  app.use(errorHandler);

  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
    server.once("error", reject);
  });

  const address = server?.address();
  if (!address || typeof address === "string") {
    throw new Error("Không mở được server test");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  // reset cả hàng đợi mockXxxOnce còn sót từ test trước.
  vi.resetAllMocks();

  fake.findUser.mockImplementation(
    async ({ where }: { where: { id: number } }) => users[where.id] ?? null
  );
  fake.buildPrompt.mockResolvedValue("PROMPT_TEXT");
  // DB giả: trả lại đúng dữ liệu được ghi (answer DbNull -> null như DB thật).
  fake.createExercise.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: 101,
      ...data,
      answer: data.answer === Prisma.DbNull ? null : data.answer,
      createdAt: "2026-11-14T00:00:00.000Z",
      updatedAt: "2026-11-14T00:00:00.000Z",
    })
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  if (server) {
    const activeServer = server;
    await new Promise<void>((resolve, reject) => {
      activeServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

async function post(body: unknown, userId?: number) {
  const response = await fetch(`${baseUrl}/api/v1/exercises/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(userId === undefined
        ? {}
        : { Authorization: `Bearer ${jwt.sign({ userId }, fake.jwtSecret)}` }),
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  const json = JSON.parse(raw) as {
    data: Record<string, unknown> | null;
    error: { code: string; message: string } | null;
  };

  expect(Object.keys(json).sort()).toEqual(["data", "error"]);
  // Mọi response (thành công hay lỗi) đều không chứa bí mật.
  expect(raw).not.toMatch(/passwordHash|JWT_SECRET|GEMINI_API_KEY/);
  expect(raw).not.toContain(fake.jwtSecret);

  return { status: response.status, json, raw };
}

describe("POST /exercises/generate - lưu bài nháp", () => {
  it.each([
    ["TEACHER ACTIVE", 4],
    ["ADMIN", 5],
  ] as const)(
    "%s: 201, lưu đúng 1 bài source=AI, status=DRAFT, in_library=false",
    async (_name, userId) => {
      fake.runAiTask.mockResolvedValueOnce({ data: mcDraft, cached: false });

      const result = await post(mcBody(), userId);

      expect(result.status).toBe(201);
      expect(result.json.error).toBeNull();

      expect(fake.runAiTask).toHaveBeenCalledTimes(1);
      expect(fake.runAiTask.mock.calls[0]?.[0]).toMatchObject({
        userId,
        role: users[userId].role,
        task: "generate",
      });

      expect(fake.createExercise).toHaveBeenCalledTimes(1);
      const arg = fake.createExercise.mock.calls[0]?.[0];

      // toEqual: đúng các field này, không thừa field nào.
      expect(arg.data).toEqual({
        type: "multiple_choice",
        skill: "READING",
        level: "A1",
        topic: "Daily routines", // theo ĐẦU VÀO (đã trim), không phải "AI tự đổi chủ đề"
        content: mcDraft.content,
        answer: [1],
        explanation: "Giải thích mẫu",
        source: "AI",
        status: "DRAFT",
        inLibrary: false,
        createdById: userId,
      });

      // Chỉ trả đúng field T2 cho phép; không kéo quan hệ (createdBy -> user) ra.
      expect(arg.select).toMatchObject({ id: true, answer: true, explanation: true });
      expect(arg.select).not.toHaveProperty("createdBy");

      // Người tạo thấy answer + explanation.
      expect(result.json.data).toMatchObject({
        id: 101,
        topic: "Daily routines",
        answer: [1],
        explanation: "Giải thích mẫu",
        source: "AI",
        status: "DRAFT",
        inLibrary: false,
        createdById: userId,
      });
    }
  );

  it("AI trả thừa status/source/inLibrary/createdById vẫn bị bỏ qua", async () => {
    fake.runAiTask.mockResolvedValueOnce({
      data: {
        ...mcDraft,
        status: "PUBLISHED",
        source: "ADMIN",
        inLibrary: true,
        createdById: 999,
      },
      cached: false,
    });

    const result = await post(mcBody(), 4);

    expect(result.status).toBe(201);
    expect(fake.createExercise.mock.calls[0]?.[0].data).toMatchObject({
      source: "AI",
      status: "DRAFT",
      inLibrary: false,
      createdById: 4,
    });
  });

  it.each([
    ["writing", "WRITING", { prompt: "Write about your day", minWords: 50 }],
    ["speaking", "SPEAKING", { prompt: "Talk about your day" }],
  ] as const)(
    "%s: answer lưu thành NULL thật (Prisma.DbNull), không phải JSON \"null\"",
    async (type, skill, content) => {
      fake.runAiTask.mockResolvedValueOnce({
        data: {
          type,
          skill,
          level: "B1",
          topic: "x",
          content,
          answer: null,
          explanation: "Gợi ý chấm",
        },
        cached: false,
      });

      const result = await post(
        { skill, level: "B1", topic: "Daily life", type, count: 1 },
        4
      );

      expect(result.status).toBe(201);
      const data = fake.createExercise.mock.calls[0]?.[0].data;
      expect(data.answer).toBe(Prisma.DbNull);
      expect(data.answer).not.toBe(Prisma.JsonNull);
      expect(result.json.data?.answer).toBeNull();
    }
  );

  it("thành công không ghi nội dung bài vào console", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => {})
    );
    fake.runAiTask.mockResolvedValueOnce({ data: mcDraft, cached: false });

    expect((await post(mcBody(), 4)).status).toBe(201);

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("POST /exercises/generate - lỗi thì KHÔNG tạo bản ghi", () => {
  it.each([
    ["AI sai khuôn", () => new AIInvalidFormatError(2), 502, "AI_INVALID_FORMAT"],
    ["AI timeout", () => new AIServiceError("TIMEOUT", 2), 504, "TIMEOUT"],
    ["AI quá tải (429)", () => new AIServiceError("RATE_LIMITED", 2), 429, "RATE_LIMITED"],
    ["AI mất kết nối", () => new AIServiceError("AI_UNAVAILABLE", 2), 502, "AI_UNAVAILABLE"],
    ["AI lỗi khác", () => new AIServiceError("AI_ERROR", 1), 502, "AI_ERROR"],
    ["hết lượt/ngày", () => new AIQuotaExceededError(), 429, "AI_QUOTA_EXCEEDED"],
    ["không kiểm được lượt", () => new AIUsageCheckError(), 503, "AI_USAGE_CHECK_FAILED"],
  ] as const)("%s → %i %s, không gọi create", async (_name, makeError, status, code) => {
    fake.runAiTask.mockRejectedValueOnce(makeError());

    const result = await post(mcBody(), 4);

    expect(result.status).toBe(status);
    expect(result.json.data).toBeNull();
    expect(result.json.error?.code).toBe(code);
    expect(fake.runAiTask).toHaveBeenCalledTimes(1);
    expect(fake.createExercise).not.toHaveBeenCalled();
  });

  it("lưu DB lỗi → 500 chuẩn, không gọi lại AI, không lộ chi tiết DB", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    fake.runAiTask.mockResolvedValueOnce({ data: mcDraft, cached: false });
    fake.createExercise.mockRejectedValueOnce(
      new Error("postgres://user:pass@db PRIVATE_CONTENT")
    );

    const result = await post(mcBody(), 4);

    expect(result.status).toBe(500);
    expect(result.json.data).toBeNull();
    expect(result.json.error?.code).toBe("INTERNAL_SERVER_ERROR");
    expect(result.raw).not.toMatch(/postgres|pass@|PRIVATE_CONTENT/);

    // AI chỉ bị gọi 1 lần (lượt đã tính), không thử lại vì lỗi lưu.
    expect(fake.runAiTask).toHaveBeenCalledTimes(1);
    expect(fake.createExercise).toHaveBeenCalledTimes(1);

    // Log chỉ có mã cố định, không có chuỗi kết nối/nội dung bài.
    expect(log).toHaveBeenCalledOnce();
    expect((log.mock.calls[0]?.[0] as Error).message).toBe(
      "EXERCISE_GENERATE_FAILED"
    );
  });
});

describe("POST /exercises/generate - quyền và body", () => {
  it.each([
    ["không token", undefined, 401],
    ["STUDENT", 1, 403],
  ] as const)("%s → %i, không gọi AI/không tạo bài", async (_name, userId, status) => {
    const result = await post(mcBody(), userId);

    expect(result.status).toBe(status);
    expect(fake.runAiTask).not.toHaveBeenCalled();
    expect(fake.createExercise).not.toHaveBeenCalled();
  });

  it.each([
    ["status", "PUBLISHED"],
    ["source", "ADMIN"],
    ["in_library", true],
    ["inLibrary", true],
    ["createdById", 1],
  ] as const)("body gửi %s → 400, không gọi AI/không tạo bài", async (field, value) => {
    const result = await post(mcBody({ [field]: value }), 4);

    expect(result.status).toBe(400);
    expect(result.json.error?.code).toBe("VALIDATION_ERROR");
    expect(fake.runAiTask).not.toHaveBeenCalled();
    expect(fake.createExercise).not.toHaveBeenCalled();
  });
});