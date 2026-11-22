/**
 * Test POST /api/v1/learning-path/me/ai (T24, task `path`). Mock prisma + provider: KHÔNG cần PostgreSQL, KHÔNG gọi Gemini thật.
 * Khuôn theo analysis.routes.test.ts (T23). Lưu lộ trình dùng kho nhớ trong bộ nhớ có khóa tuần tự để mô phỏng
 * pg_advisory_xact_lock; test thứ tự gọi chứng minh AI KHÔNG bao giờ chạy trong transaction/khi đang giữ khóa.
 */
import express from "express";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultAiDeps } from "../../ai/ai.service.defaults";
import type { AiUsageStatus } from "../../ai/ai.types";
import { AIProviderError, type AIErrorKind, type AIRequest } from "../../ai/provider";
import { AI_TITLE_MAX_LENGTH, WEEKLY_PATH_SIZE } from "./learning-paths.constants";
import { learningPathRoutes } from "./learning-paths.routes";
import { buildItemTitle } from "./learning-paths.select";
import { getWeekStart } from "./learning-paths.week";

const { db, generate } = vi.hoisted(() => ({
  db: {
    user: { findUnique: vi.fn() },
    skillProfile: { findMany: vi.fn() },
    exercise: { findMany: vi.fn() },
    learningPath: { findFirst: vi.fn(), create: vi.fn(), findUniqueOrThrow: vi.fn() },
    learningPathItem: { create: vi.fn() },
    promptTemplate: { findUnique: vi.fn() },
    aiUsageLog: { count: vi.fn(), create: vi.fn() },
    attempt: { findMany: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  },
  generate: vi.fn(),
}));
vi.mock("../../config/prisma", () => ({ prisma: db }));
vi.mock("../../config/env", () => ({
  env: {
    JWT_SECRET: "path-ai-test-key",
    GEMINI_API_KEY: "path-ai-fake-gemini-secret",
    GEMINI_MODEL: "path-ai-test-model",
    APP_TIMEZONE: "Asia/Ho_Chi_Minh",
    AI_DAILY_LIMIT_STUDENT: 5,
    AI_DAILY_LIMIT_TEACHER: 5,
    AI_CACHE_TASKS: "path",
    AI_CACHE_TTL_SECONDS: 60,
    AI_CACHE_MAX_ENTRIES: 20,
    AI_RETRY_429_MAX: 1,
    AI_RETRY_429_DELAY_MS: 0,
    AI_RETRY_NETWORK_MAX: 1,
    AI_RETRY_NETWORK_DELAY_MS: 0,
  },
}));
vi.mock("../../ai/gemini.provider", () => ({
  GeminiProvider: class {
    readonly name = "path-ai-mock";
    generate = generate;
  },
}));

const TZ = "Asia/Ho_Chi_Minh";
const testKey = "path-ai-test-key";
const STUDENT = 3;
const accounts = new Map([
  [1, { id: 1, role: "TEACHER", status: "ACTIVE" }],
  [2, { id: 2, role: "ADMIN", status: "ACTIVE" }],
  [STUDENT, { id: STUDENT, role: "STUDENT", status: "ACTIVE" }],
  [4, { id: 4, role: "STUDENT", status: "PENDING" }],
  [5, { id: 5, role: "STUDENT", status: "LOCKED" }],
]);
const privateText = "path-ai-raw-private-canary";
const privateValues = [privateText, testKey, "path-ai-fake-gemini-secret", "JWT_SECRET", "GEMINI_API_KEY"];

// ---- Dữ liệu bài: topic = "T<id>" để từ ref đoán ngược ra id bài thật -------------------------------------
const mk = (id: number, skill: string, topic = `T${id}`) => ({
  id, type: "fill_blank", skill, level: "A1", topic, createdAt: new Date(2026, 0, id % 28 + 1),
});
const LIBRARY = [
  mk(401, "SPEAKING"), mk(301, "LISTENING"),
  mk(201, "READING"), mk(202, "READING"),
  mk(101, "WRITING"), mk(102, "WRITING"), mk(103, "WRITING"),
  mk(501, "FOUNDATION"),
];
const ALL_IDS = LIBRARY.map((row) => row.id);

// ---- Kho lộ trình trong bộ nhớ + mô phỏng khóa transaction -----------------------------------------------
interface StoredItem { id: number; title: string; done: boolean; exerciseId: number | null }
interface StoredPath { id: number; studentId: number; weekStart: Date; createdAt: Date; items: StoredItem[] }
let paths: StoredPath[] = [];
let nextPathId = 1;
let nextItemId = 1;
let library = LIBRARY;
let txDepth = 0;
let txChain: Promise<unknown> = Promise.resolve();
let events: string[] = [];

const hydrate = (path: StoredPath) => ({
  ...path,
  items: path.items.map((item) => {
    const row = LIBRARY.find((candidate) => candidate.id === item.exerciseId);
    return { ...item, exercise: row ? { ...row, status: "PUBLISHED", inLibrary: true } : null };
  }),
});

function installDb() {
  db.user.findUnique.mockImplementation(({ where }) => accounts.get(where.id) ?? null);
  db.skillProfile.findMany.mockResolvedValue([]); // chưa có hồ sơ: 5 kỹ năng theo thứ tự enum, mức A1
  db.exercise.findMany.mockImplementation(async ({ where, take }) =>
    library.filter((row) => row.skill === where.skill && row.level === where.level).slice(0, take));
  db.learningPath.findFirst.mockImplementation(async ({ where }) => {
    const found = paths.find((p) => p.studentId === where.studentId && p.weekStart.getTime() === where.weekStart.getTime());
    return found ? hydrate(found) : null;
  });
  db.learningPath.create.mockImplementation(async ({ data }) => {
    const path = { id: nextPathId++, studentId: data.studentId, weekStart: data.weekStart, createdAt: new Date("2026-11-22T03:00:00Z"), items: [] };
    paths.push(path);
    return { id: path.id };
  });
  db.learningPathItem.create.mockImplementation(async ({ data }) => {
    paths.find((p) => p.id === data.pathId)!.items.push({ id: nextItemId++, title: data.title, done: data.done, exerciseId: data.exerciseId });
    return {};
  });
  db.learningPath.findUniqueOrThrow.mockImplementation(async ({ where }) => hydrate(paths.find((p) => p.id === where.id)!));
  db.$executeRaw.mockResolvedValue(1);
  // Mô phỏng khóa: các transaction chạy NỐI TIẾP nhau (như pg_advisory_xact_lock cùng khóa).
  db.$transaction.mockImplementation((fn: (tx: typeof db) => Promise<unknown>) => {
    const run = txChain.then(async () => {
      events.push("tx:start");
      txDepth += 1;
      try { return await fn(db); } finally { txDepth -= 1; events.push("tx:end"); }
    });
    txChain = run.catch(() => undefined);
    return run;
  });
  db.promptTemplate.findUnique.mockResolvedValue(null);
  db.aiUsageLog.count.mockResolvedValue(0);
  db.aiUsageLog.create.mockResolvedValue({ id: 1 });
}

// ---- Tiện ích gọi HTTP + dựng phản hồi AI ----------------------------------------------------------------
let server: Server;
let baseUrl: string;
const sign = (userId: number, key = testKey, expiresIn = 60) => jwt.sign({ userId }, key, { expiresIn });

async function post(token?: string, body?: unknown, path = "/me/ai") {
  const headers: Record<string, string> = token === undefined ? {} : { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST", headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

const reply = (value: unknown) => ({
  text: typeof value === "string" ? value : JSON.stringify(value),
  model: "path-ai-test-model",
  tokens: { input: 2, output: 3 },
});

/** Danh sách ứng viên AI nhìn thấy, đọc ngược từ prompt: [{ ref, topic, ... }]. */
const candidatesOf = (prompt: string): { ref: string; topic: string; skill: string; level: string }[] => {
  const json = prompt.match(/<path_candidates>\n([^\n]+)\n<\/path_candidates>/)?.[1];
  if (json === undefined) throw new Error("Không tìm thấy khối ứng viên trong prompt");
  return JSON.parse(json);
};
const idOfRef = (cands: ReturnType<typeof candidatesOf>, ref: string) => Number(cands.find((c) => c.ref === ref)!.topic.slice(1));

/** AI mock: chọn ref theo hàm `pick` (nhận danh sách ứng viên), có thể chờ để các request song song chồng nhau. */
function aiPicks(pick: (cands: ReturnType<typeof candidatesOf>) => unknown, delayMs = 0) {
  generate.mockImplementation(async (request: AIRequest) => {
    events.push("ai");
    if (txDepth > 0) throw new Error("AI bị gọi trong lúc đang giữ transaction/khóa");
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return reply(pick(candidatesOf(request.prompt)));
  });
}
const pickRefs = (refs: string[], title = (ref: string) => `Tiêu đề ${ref}`) =>
  (cands: ReturnType<typeof candidatesOf>) => ({ items: refs.map((ref) => ({ ref, title: title(ref) })) });

const logEntry = (status: AiUsageStatus, tokens: number | null = null, userId = STUDENT) => ({ data: { userId, task: "path", status, tokens } });
const expectLogs = (...entries: ReturnType<typeof logEntry>[]) =>
  expect(db.aiUsageLog.create.mock.calls.map(([entry]) => entry)).toEqual(entries);
const expectNoAi = () => {
  expect(db.promptTemplate.findUnique).not.toHaveBeenCalled();
  expect(db.aiUsageLog.count).not.toHaveBeenCalled();
  expect(generate).not.toHaveBeenCalled();
  expectLogs();
};
const expectNoWrites = () => {
  expect(db.$transaction).not.toHaveBeenCalled();
  expect(db.learningPath.create).not.toHaveBeenCalled();
  expect(db.learningPathItem.create).not.toHaveBeenCalled();
  expect(paths).toHaveLength(0);
};
const currentWeek = () => getWeekStart(new Date(), TZ);

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/learning-path", learningPathRoutes);
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ data: null, error: { code: "INTERNAL_ERROR", message: "Lỗi hệ thống" } });
  });
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Không mở được server test");
  baseUrl = `http://127.0.0.1:${address.port}/api/v1/learning-path`;
});
afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(async () => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
  await getDefaultAiDeps().cache.clear();
  paths = []; nextPathId = 1; nextItemId = 1; library = LIBRARY; txDepth = 0; txChain = Promise.resolve(); events = [];
  installDb();
  aiPicks(pickRefs(["c1", "c2", "c3"]));
});

// ---------------------------------------------------------------------------
describe("POST /learning-path/me/ai: xác thực, vai trò, body", () => {
  it.each([
    ["thiếu token", undefined],
    ["token hết hạn", sign(STUDENT, testKey, -60)],
    ["token sai chữ ký", sign(STUDENT, "wrong-key")],
    ["user đã bị xóa", sign(99)],
  ])("401 khi %s, không chạm DB lộ trình hay AI", async (_label, token) => {
    const result = await post(token, {});
    expect(result.status).toBe(401);
    expect(db.learningPath.findFirst).not.toHaveBeenCalled();
    expect(db.exercise.findMany).not.toHaveBeenCalled();
    expectNoAi();
    expectNoWrites();
  });

  it.each([
    ["TEACHER", 1], ["ADMIN", 2], ["HS PENDING", 4], ["HS LOCKED", 5],
  ])("403 cho %s, không chạm DB lộ trình hay AI", async (_label, userId) => {
    const result = await post(sign(userId), {});
    expect(result.status).toBe(403);
    expect(db.learningPath.findFirst).not.toHaveBeenCalled();
    expect(db.exercise.findMany).not.toHaveBeenCalled();
    expectNoAi();
    expectNoWrites();
  });

  it.each([
    ["field lạ studentId", { studentId: 9 }],
    ["field lạ exercise_id", { exercise_id: 5 }],
    ["field lạ week_start", { week_start: "2026-01-05" }],
    ["field lạ items", { items: [{ ref: "c1" }] }],
  ])("400 khi client gửi %s", async (_label, body) => {
    const result = await post(sign(STUDENT), body);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(db.learningPath.findFirst).not.toHaveBeenCalled();
    expectNoAi();
    expectNoWrites();
  });

  it("chấp nhận không body và body {}", async () => {
    expect((await post(sign(STUDENT))).status).toBe(201);
    paths = [];
    expect((await post(sign(STUDENT), {})).status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
describe("POST /learning-path/me/ai: luồng tạo thành công", () => {
  it("201: item đúng bài thật theo ref, đúng thứ tự AI sắp (id tăng dần), done=false, response đúng khuôn", async () => {
    aiPicks((cands) => ({
      items: [
        { ref: "c5", title: "  Luyện <b>Viết</b>\n bài đầu  " },
        { ref: "c1", title: "Nghe trước" },
        { ref: "c3", title: "Đọc sau" },
      ].map((item) => ({ ...item })),
    }));

    const result = await post(sign(STUDENT), {});

    expect(result.status).toBe(201);
    expect(result.body.error).toBeNull();
    const data = result.body.data;
    expect(Object.keys(data).sort()).toEqual(["created_at", "id", "items", "progress", "week_start"]);
    expect(data.week_start).toBe(currentWeek().toISOString().slice(0, 10));
    expect(data.progress).toEqual({ done: 0, total: 3 });

    const { prompt } = generate.mock.calls[0][0] as AIRequest;
    const cands = candidatesOf(prompt);
    expect(data.items.map((item: { exercise: { id: number } }) => item.exercise.id)).toEqual(
      ["c5", "c1", "c3"].map((ref) => idOfRef(cands, ref))
    );
    expect(data.items.map((item: { title: string }) => item.title)).toEqual(["Luyện Viết bài đầu", "Nghe trước", "Đọc sau"]);
    const itemIds = data.items.map((item: { id: number }) => item.id);
    expect([...itemIds].sort((a, b) => a - b)).toEqual(itemIds);
    for (const item of data.items) {
      expect(item.done).toBe(false);
      expect(Object.keys(item).sort()).toEqual(["done", "exercise", "id", "title"]);
      expect(Object.keys(item.exercise).sort()).toEqual(["id", "level", "skill", "topic", "type"]);
    }
    expect(JSON.stringify(result.body)).not.toMatch(/answer|content|explanation|passwordHash|JWT_SECRET|GEMINI_API_KEY|"ref"/);
    expect(paths).toHaveLength(1);
    expectLogs(logEntry("ok", 5));
  });

  it("ứng viên dùng đúng luật: tối đa K=3 bài/kỹ năng, đủ 5 kỹ năng, chỉ gửi ref/skill/level/type/topic/reason/focus", async () => {
    await post(sign(STUDENT), {});
    const { prompt } = generate.mock.calls[0][0] as AIRequest;
    const cands = candidatesOf(prompt);
    expect(cands.map((c) => c.ref)).toEqual(["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]);
    expect(cands.map((c) => Number(c.topic.slice(1))).sort()).toEqual([...ALL_IDS].sort());
    for (const call of db.exercise.findMany.mock.calls) {
      expect(call[0].take).toBe(3);
      expect(call[0].where).toMatchObject({ status: "PUBLISHED", inLibrary: true, attempts: { none: { studentId: STUDENT } } });
    }
    expect(db.exercise.findMany).toHaveBeenCalledTimes(5);
    for (const secret of ["answer", "explanation", "content", "hs@", ...privateValues, '"id"']) {
      expect(prompt).not.toContain(secret);
    }
  });

  it("ref lạ bị loại, trùng giữ lần đầu, vượt N bị cắt, ít hơn N giữ nguyên (không bù bằng luật)", async () => {
    aiPicks(pickRefs(["c99", "c2", "c2", "zzz", "c7", "c1", "c4", "c6", "c8", "c3"]));
    const result = await post(sign(STUDENT), {});
    expect(result.status).toBe(201);
    const cands = candidatesOf((generate.mock.calls[0][0] as AIRequest).prompt);
    expect(result.body.data.items).toHaveLength(WEEKLY_PATH_SIZE);
    expect(result.body.data.items.map((i: { exercise: { id: number } }) => i.exercise.id)).toEqual(
      ["c2", "c7", "c1", "c4", "c6"].map((ref) => idOfRef(cands, ref))
    );

    paths = []; await getDefaultAiDeps().cache.clear();
    aiPicks(pickRefs(["c4"]));
    const few = await post(sign(STUDENT), {});
    expect(few.status).toBe(201);
    expect(few.body.data.items).toHaveLength(1);
  });

  it("title: làm sạch, cắt đúng giới hạn (đúng bằng giữ nguyên, hơn 1 ký tự cắt), rỗng -> buildItemTitle", async () => {
    const exact = "a".repeat(AI_TITLE_MAX_LENGTH);
    aiPicks((cands) => ({
      items: [
        { ref: "c1", title: exact },
        { ref: "c2", title: exact + "b" },
        { ref: "c3", title: " <i></i>\n\t\u0000 " },
        { ref: "c4" },
      ],
    }));
    const result = await post(sign(STUDENT), {});
    const cands = candidatesOf((generate.mock.calls[0][0] as AIRequest).prompt);
    const fallback = (ref: string) => {
      const c = cands.find((x) => x.ref === ref)!;
      return buildItemTitle(c.skill, c.level, null);
    };
    expect(result.body.data.items.map((i: { title: string }) => i.title)).toEqual([exact, exact, fallback("c3"), fallback("c4")]);
  });

  it("AI chỉ được gọi TRƯỚC và NGOÀI transaction/khóa (kiểm thứ tự gọi)", async () => {
    await post(sign(STUDENT), {});
    expect(events).toEqual(["ai", "tx:start", "tx:end"]);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$executeRaw).toHaveBeenCalledTimes(1); // khóa lấy trong transaction, sau khi AI xong
    expect(db.$executeRaw.mock.invocationCallOrder[0]).toBeGreaterThan(generate.mock.invocationCallOrder[0]);
  });
});

// ---------------------------------------------------------------------------
describe("POST /learning-path/me/ai: idempotent, ứng viên rỗng, song song, cache", () => {
  it("tuần đã có lộ trình do AI tạo -> 200 trả bản cũ, provider không gọi thêm, không ghi log thêm", async () => {
    const first = await post(sign(STUDENT), {});
    expect(first.status).toBe(201);
    const second = await post(sign(STUDENT), {});
    expect(second.status).toBe(200);
    expect(second.body.data).toEqual(first.body.data);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(db.aiUsageLog.count).toHaveBeenCalledTimes(1);
    expectLogs(logEntry("ok", 5));
    expect(paths).toHaveLength(1);
  });

  it("tuần đã có lộ trình do LUẬT tạo -> 200, không làm lại, 0 lần gọi AI, 0 log, 0 lượt", async () => {
    paths.push({
      id: nextPathId++, studentId: STUDENT, weekStart: currentWeek(), createdAt: new Date("2026-11-22T01:00:00Z"),
      items: [{ id: nextItemId++, title: "Luyện Viết mức A1", done: false, exerciseId: 101 }],
    });
    const result = await post(sign(STUDENT), {});
    expect(result.status).toBe(200);
    expect(result.body.data.items.map((i: { title: string }) => i.title)).toEqual(["Luyện Viết mức A1"]);
    expectNoAi();
    expect(db.exercise.findMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("lộ trình của HS khác hoặc tuần trước không chặn việc tạo", async () => {
    paths.push({ id: nextPathId++, studentId: 77, weekStart: currentWeek(), createdAt: new Date(), items: [] });
    paths.push({ id: nextPathId++, studentId: STUDENT, weekStart: new Date(currentWeek().getTime() - 7 * 86400000), createdAt: new Date(), items: [] });
    expect((await post(sign(STUDENT), {})).status).toBe(201);
    expect(paths).toHaveLength(3);
  });

  it("ứng viên rỗng -> 422 NO_EXERCISES_AVAILABLE, 0 lần gọi AI, 0 log, 0 dòng DB", async () => {
    library = [];
    const result = await post(sign(STUDENT), {});
    expect(result.status).toBe(422);
    expect(result.body).toEqual({
      data: null,
      error: { code: "NO_EXERCISES_AVAILABLE", message: expect.any(String) },
    });
    expectNoAi();
    expectNoWrites();
  });

  it("hai POST song song -> chỉ 1 lộ trình; request thua trả lộ trình thắng (200); cả hai có thể cùng gọi AI (2 lượt)", async () => {
    aiPicks(pickRefs(["c1", "c2"]), 25); // chờ để cả hai cùng qua bước "chưa có lộ trình"
    const token = sign(STUDENT);
    const [a, b] = await Promise.all([post(token, {}), post(token, {})]);

    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.data).toEqual(b.body.data);
    expect(paths).toHaveLength(1);
    expect(paths[0].items).toHaveLength(2);
    expect(generate).toHaveBeenCalledTimes(2); // hạn chế đã biết: tốn 2 lượt
    expectLogs(logEntry("ok", 5), logEntry("ok", 5));
    expect(events.filter((e) => e === "ai")).toHaveLength(2);
    expect(events.indexOf("tx:start")).toBeGreaterThan(events.lastIndexOf("ai")); // chỉ vào transaction sau khi cả hai AI đã xong
  });

  it("lần 2 cùng đầu vào hợp lệ -> cached, không gọi provider, vẫn tạo lộ trình", async () => {
    const first = await post(sign(STUDENT), {});
    expect(first.status).toBe(201);
    paths = []; // sang tuần mới nhưng ứng viên không đổi => prompt không đổi

    const second = await post(sign(STUDENT), {});
    expect(second.status).toBe(201);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(second.body.data.items.map((i: { exercise: { id: number } }) => i.exercise.id)).toEqual(
      first.body.data.items.map((i: { exercise: { id: number } }) => i.exercise.id)
    );
    expectLogs(logEntry("ok", 5), logEntry("cached"));
  });

  it("đổi tập ứng viên -> prompt khác -> cache trượt", async () => {
    await post(sign(STUDENT), {});
    paths = [];
    library = LIBRARY.filter((row) => row.id !== 103);
    await post(sign(STUDENT), {});
    expect(generate).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
describe("POST /learning-path/me/ai: lỗi AI (mọi ca KHÔNG tạo dòng DB, không bị cache, không lộ dữ liệu)", () => {
  it.each([
    ["JSON sai", privateText],
    ["mọi ref lạ", JSON.stringify({ items: [{ ref: "c99", title: "x" }, { ref: "zz", title: "y" }] })],
    ["items rỗng", JSON.stringify({ items: [] })],
    ["field lạ ở envelope", JSON.stringify({ items: [{ ref: "c1", title: "ok" }], note: "thừa" })],
  ])("%s: thử lại tối đa 2 lần gọi rồi AI_INVALID_FORMAT; lỗi không cache", async (_label, invalid) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    generate.mockReset();
    generate.mockResolvedValueOnce(reply(invalid)).mockResolvedValueOnce(reply(invalid));

    const failed = await post(sign(STUDENT), {});
    expect(failed.status).toBe(502);
    expect(failed.body.error.code).toBe("AI_INVALID_FORMAT");
    expect(generate).toHaveBeenCalledTimes(2);
    expectLogs(logEntry("error", 10));
    expectNoWrites();
    const output = JSON.stringify({ body: failed.body, warn: warn.mock.calls, error: error.mock.calls, logs: db.aiUsageLog.create.mock.calls });
    for (const value of [...privateValues, "path_candidates", "Tiêu đề", "T101"]) expect(output).not.toContain(value);

    // Lỗi không được cache: lần sau gọi lại provider và thành công.
    aiPicks(pickRefs(["c1"]));
    expect((await post(sign(STUDENT), {})).status).toBe(201);
    expect(generate).toHaveBeenCalledTimes(3); // 2 lần của ca lỗi + 1 lần mới: lỗi không bị cache nên provider được gọi lại
    expectLogs(logEntry("error", 10), logEntry("ok", 5));
  });

  const failures: { kind: AIErrorKind; code: string; http: number; usage: AiUsageStatus }[] = [
    { kind: "RATE_LIMITED", code: "RATE_LIMITED", http: 429, usage: "rate_limited" },
    { kind: "TIMEOUT", code: "TIMEOUT", http: 504, usage: "error" },
    { kind: "NETWORK", code: "AI_UNAVAILABLE", http: 502, usage: "error" },
    { kind: "AUTH", code: "AI_UNAVAILABLE", http: 502, usage: "error" },
    { kind: "INVALID_RESPONSE", code: "AI_INVALID_FORMAT", http: 502, usage: "error" },
  ];
  it.each(failures)("provider lỗi $kind -> $code ($http), 1 lần gọi, 1 log, không tạo lộ trình", async ({ kind, code, http, usage }) => {
    generate.mockReset();
    generate.mockRejectedValue(new AIProviderError(kind, privateText));
    const failed = await post(sign(STUDENT), {});

    expect(failed.status).toBe(http);
    expect(failed.body.error.code).toBe(code);
    expect(JSON.stringify(failed.body)).not.toContain(privateText);
    expect(generate).toHaveBeenCalledTimes(1);
    expectLogs(logEntry(usage));
    expectNoWrites();
  });

  it("hết lượt trong ngày -> 429 AI_QUOTA_EXCEEDED, đếm 1 lần, 1 log rate_limited, không gọi provider, không tạo lộ trình", async () => {
    db.aiUsageLog.count.mockResolvedValue(5); // AI_DAILY_LIMIT_STUDENT = 5
    const failed = await post(sign(STUDENT), {});
    expect(failed.status).toBe(429);
    expect(failed.body.error.code).toBe("AI_QUOTA_EXCEEDED");
    expect(db.aiUsageLog.count).toHaveBeenCalledTimes(1);
    expect(generate).not.toHaveBeenCalled();
    expectLogs(logEntry("rate_limited"));
    expectNoWrites();
  });

  it.each(["prompt", "quota"])("lỗi %s trước provider vẫn ghi đúng 1 log, AI_UNAVAILABLE, không lộ chi tiết", async (step) => {
    const boom = new Error(privateText);
    if (step === "prompt") db.promptTemplate.findUnique.mockRejectedValue(boom);
    else db.aiUsageLog.count.mockRejectedValue(boom);

    const failed = await post(sign(STUDENT), {});
    expect(failed.status).toBe(502);
    expect(failed.body.error.code).toBe("AI_UNAVAILABLE");
    expect(JSON.stringify(failed.body)).not.toContain(privateText);
    expect(generate).not.toHaveBeenCalled();
    expectLogs(logEntry("error"));
    expectNoWrites();
  });

  it("lỗi lưu DB (sau khi AI đã trả) -> 500 chung, không lộ chi tiết; log AI vẫn là ok", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.$transaction.mockRejectedValue(new Error(privateText));
    const failed = await post(sign(STUDENT), {});
    expect(failed.status).toBe(500);
    expect(JSON.stringify(failed.body)).not.toContain(privateText);
    expectLogs(logEntry("ok", 5));
    expect(paths).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("không hồi quy bản không AI", () => {
  it("POST /me/ai không đổi route cũ: POST /me vẫn tạo bằng luật, không gọi AI", async () => {
    const result = await post(sign(STUDENT), {}, "/me");
    expect(result.status).toBe(201);
    expect(result.body.data.items.length).toBeGreaterThan(0);
    expect(result.body.data.items[0].title).toMatch(/^Luyện /);
    expectNoAi();
  });
});