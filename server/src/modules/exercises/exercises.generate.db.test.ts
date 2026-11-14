/**
 * Test tích hợp T11: POST /api/v1/exercises/generate lưu bài nháp vào DB THẬT.
 *
 * - Chỉ mock AI (runAiTask) và buildPrompt; route, quyền, Zod, service, Prisma, DB chạy thật.
 * - Dùng DATABASE_URL trong .env (cần bật Docker + PostgreSQL). Test TỰ TẠO user riêng
 *   (email bắt đầu bằng "t11db_") và XÓA sạch bài + user do test tạo khi xong.
 * - Tiền tố "t11db_" KHÁC các file test khác để chạy song song không xóa nhầm nhau.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";

const fake = vi.hoisted(() => ({
  runAiTask: vi.fn(),
  buildPrompt: vi.fn(),
}));

// Giữ nguyên mọi export khác của module, chỉ thay đúng 1 hàm.
vi.mock("../../ai/ai.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../ai/ai.service")>()),
  runAiTask: fake.runAiTask,
}));

vi.mock("../../ai/prompts/prompt-templates", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../ai/prompts/prompt-templates")>()),
  buildPrompt: fake.buildPrompt,
}));

import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AIInvalidFormatError } from "../../ai/json";
import { AIServiceError } from "../../ai/resilience";
import { AIQuotaExceededError } from "../../ai/ai.types";

const PREFIX = "t11db_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

const ids = { admin: 0, teacher: 0, teacher2: 0, student: 0 };

let server: Server;
let baseUrl = "";

// 14 field duy nhất được phép xuất hiện trong response (giống T2).
const RESPONSE_KEYS = [
  "answer", "content", "createdAt", "createdById", "explanation", "id",
  "inLibrary", "level", "skill", "source", "status", "topic", "type", "updatedAt",
].sort();

const createUser = async (
  label: string,
  role: "ADMIN" | "TEACHER" | "STUDENT"
) => {
  const user = await prisma.user.create({
    data: {
      name: `${RUN_ID} ${label}`,
      email: `${RUN_ID}_${label}@test.local`,
      passwordHash: "not-a-real-hash",
      role,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  return user.id;
};

const cleanup = async (userIds: number[]) => {
  if (userIds.length === 0) return;
  await prisma.exercise.deleteMany({ where: { createdById: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
};

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error(
      "Không kết nối được database. Kiểm tra DATABASE_URL trong server/.env và PostgreSQL đang chạy."
    );
  }

  // Dọn rác lần chạy trước bị dừng giữa chừng (chỉ động vào user có tiền tố t11db_).
  const leftovers = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  await cleanup(leftovers.map((u: { id: number }) => u.id));

  ids.admin = await createUser("admin", "ADMIN");
  ids.teacher = await createUser("teacher", "TEACHER");
  ids.teacher2 = await createUser("teacher2", "TEACHER");
  ids.student = await createUser("student", "STUDENT");

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Không mở được server test");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await cleanup(Object.values(ids).filter((id) => id > 0));
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.resetAllMocks();
  fake.buildPrompt.mockResolvedValue("PROMPT_TEXT");
});

// ---------------------------------------------------------------------------
// Hàm tiện ích
// ---------------------------------------------------------------------------
type Body = {
  data: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
};

const tokenOf = (userId: number) => jwt.sign({ userId }, env.JWT_SECRET);

const call = async (
  method: string,
  path: string,
  userId?: number,
  body?: unknown
) => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userId !== undefined) headers.Authorization = `Bearer ${tokenOf(userId)}`;

  const res = await fetch(`${baseUrl}/api/v1/exercises${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await res.text();

  // Mọi response đều không chứa bí mật.
  expect(raw).not.toMatch(/passwordHash|JWT_SECRET|GEMINI_API_KEY/);
  expect(raw).not.toContain(env.JWT_SECRET);

  return { status: res.status, raw, body: JSON.parse(raw) as Body };
};

const mcBody = (overrides: Record<string, unknown> = {}) => ({
  skill: "READING",
  level: "A1",
  topic: "Daily routines",
  type: "multiple_choice",
  count: 1,
  ...overrides,
});

// Bài AI "đã hợp lệ" (topic cố ý khác đầu vào để chứng minh server lưu theo đầu vào).
const mcDraft = {
  type: "multiple_choice",
  skill: "READING",
  level: "A1",
  topic: "AI tự đổi chủ đề",
  content: { questions: [{ q: "Q1", options: ["a", "b"] }] },
  answer: [1],
  explanation: "Giải thích mẫu",
};

const countOf = (userId: number) =>
  prisma.exercise.count({ where: { createdById: userId } });

/** Gọi generate (AI giả trả mcDraft) và trả về id bài vừa tạo. */
const generateDraft = async (userId: number) => {
  fake.runAiTask.mockResolvedValueOnce({ data: mcDraft, cached: false });
  const r = await call("POST", "/generate", userId, mcBody());
  expect(r.status).toBe(201);
  return Number(r.body.data?.id);
};

// Truy vấn thô để phân biệt NULL của SQL với JSON "null".
const answerColumn = async (id: number) => {
  const rows = await prisma.$queryRaw<{ is_null: boolean; txt: string | null }[]>`
    SELECT (answer IS NULL) AS is_null, answer::text AS txt
    FROM exercises WHERE id = ${id}`;
  return rows[0];
};

// ---------------------------------------------------------------------------
// Lưu thành công
// ---------------------------------------------------------------------------
describe("POST /exercises/generate - lưu bài nháp vào DB", () => {
  it.each([
    ["TEACHER ACTIVE", "teacher"],
    ["ADMIN", "admin"],
  ] as const)(
    "%s: 201, DB có đúng 1 bản ghi source=AI, status=DRAFT, in_library=false",
    async (_name, who) => {
      const userId = ids[who];
      const before = await countOf(userId);

      fake.runAiTask.mockResolvedValueOnce({ data: mcDraft, cached: false });
      const r = await call("POST", "/generate", userId, mcBody());

      expect(r.status).toBe(201);
      expect(r.body.error).toBeNull();
      expect(fake.runAiTask).toHaveBeenCalledTimes(1);

      // Đúng 14 field, người tạo thấy answer + explanation.
      expect(Object.keys(r.body.data ?? {}).sort()).toEqual(RESPONSE_KEYS);
      expect(r.body.data?.answer).toEqual([1]);
      expect(r.body.data?.explanation).toBe("Giải thích mẫu");

      // DB: thêm đúng 1 bản ghi.
      expect(await countOf(userId)).toBe(before + 1);

      const row = await prisma.exercise.findUniqueOrThrow({
        where: { id: Number(r.body.data?.id) },
      });
      expect(row.source).toBe("AI");
      expect(row.status).toBe("DRAFT");
      expect(row.inLibrary).toBe(false);
      expect(row.createdById).toBe(userId);
      expect(row.type).toBe("multiple_choice");
      expect(row.skill).toBe("READING");
      expect(row.level).toBe("A1");
      expect(row.topic).toBe("Daily routines"); // theo ĐẦU VÀO, không phải topic AI trả
      expect(row.content).toEqual(mcDraft.content);
      expect(row.answer).toEqual([1]);
      expect(row.explanation).toBe("Giải thích mẫu");
    }
  );

  it.each([
    ["writing", "WRITING", { prompt: "Write about your day", minWords: 50 }],
    ["speaking", "SPEAKING", { prompt: "Talk about your day" }],
  ] as const)(
    "%s: cột answer là NULL thật của SQL, không phải JSON \"null\"",
    async (type, skill, content) => {
      fake.runAiTask.mockResolvedValueOnce({
        data: { type, skill, level: "B1", topic: "x", content, answer: null, explanation: "Gợi ý chấm" },
        cached: false,
      });

      const r = await call("POST", "/generate", ids.teacher, {
        skill, level: "B1", topic: "Daily life", type, count: 1,
      });
      expect(r.status).toBe(201);
      expect(r.body.data?.answer).toBeNull();

      const col = await answerColumn(Number(r.body.data?.id));
      expect(col.is_null).toBe(true); // NULL của SQL
      expect(col.txt).toBeNull(); // nếu lưu nhầm JSON null thì txt sẽ là chuỗi "null"
    }
  );

  it("dạng có đáp án (multiple_choice): answer KHÔNG NULL, đúng nội dung", async () => {
    const id = await generateDraft(ids.teacher);
    const col = await answerColumn(id);
    expect(col.is_null).toBe(false);
    expect(JSON.parse(col.txt as string)).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
// Lỗi thì không tạo bản ghi
// ---------------------------------------------------------------------------
describe("POST /exercises/generate - lỗi không tạo bản ghi", () => {
  it.each([
    ["AI sai khuôn", () => new AIInvalidFormatError(2), 502, "AI_INVALID_FORMAT"],
    ["AI timeout", () => new AIServiceError("TIMEOUT", 2), 504, "TIMEOUT"],
    ["hết lượt/ngày", () => new AIQuotaExceededError(), 429, "AI_QUOTA_EXCEEDED"],
  ] as const)("%s → %i %s, DB không thêm bản ghi", async (_name, makeError, status, code) => {
    const before = await countOf(ids.teacher);
    fake.runAiTask.mockRejectedValueOnce(makeError());

    const r = await call("POST", "/generate", ids.teacher, mcBody());

    expect(r.status).toBe(status);
    expect(r.body.data).toBeNull();
    expect(r.body.error?.code).toBe(code);
    expect(await countOf(ids.teacher)).toBe(before);
  });

  it.each([
    ["không token", undefined, 401],
    ["STUDENT", ids.student, 403],
  ] as const)("%s → %i, không gọi AI, không có bản ghi", async (_name, _userId, status) => {
    // ids.student chỉ có giá trị sau beforeAll, nên đọc lại ở đây.
    const userId = _name === "STUDENT" ? ids.student : undefined;
    const before = await countOf(ids.student);

    const r = await call("POST", "/generate", userId, mcBody());

    expect(r.status).toBe(status);
    expect(fake.runAiTask).not.toHaveBeenCalled();
    expect(await countOf(ids.student)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Ai thấy được bài DRAFT vừa tạo
// ---------------------------------------------------------------------------
describe("Bài DRAFT do AI sinh - quyền xem/sửa", () => {
  it("HS: GET chi tiết → 404 (không lộ bài), và bài không thuộc thư viện", async () => {
    const id = await generateDraft(ids.teacher);

    const r = await call("GET", `/${id}`, ids.student);
    expect(r.status).toBe(404);
    expect(r.body.data).toBeNull();
    expect(r.body.error?.code).toBe("NOT_FOUND");
    expect(r.raw).not.toContain("Giải thích mẫu"); // explanation/answer không lọt

    // Điều kiện thư viện chung theo Project.md: in_library = true AND status = PUBLISHED.
    const inLibrary = await prisma.exercise.count({
      where: { id, inLibrary: true, status: "PUBLISHED" },
    });
    expect(inLibrary).toBe(0);
  });

  it("GV khác: GET → 404, PATCH → 404, bài không bị đổi", async () => {
    const id = await generateDraft(ids.teacher);

    const get = await call("GET", `/${id}`, ids.teacher2);
    expect(get.status).toBe(404);
    expect(get.body.error?.code).toBe("NOT_FOUND");

    const patch = await call("PATCH", `/${id}`, ids.teacher2, { topic: "Bị đổi trái phép" });
    expect(patch.status).toBe(404);

    const row = await prisma.exercise.findUniqueOrThrow({ where: { id } });
    expect(row.topic).toBe("Daily routines");
    expect(row.status).toBe("DRAFT");
  });

  it("GV chủ bài và ADMIN: GET → 200, thấy answer + explanation", async () => {
    const id = await generateDraft(ids.teacher);

    for (const userId of [ids.teacher, ids.admin]) {
      const r = await call("GET", `/${id}`, userId);
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({
        id,
        source: "AI",
        status: "DRAFT",
        inLibrary: false,
        answer: [1],
        explanation: "Giải thích mẫu",
      });
    }
  });
});