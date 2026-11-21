/**
 * Test tích hợp PATCH /api/v1/learning-path/items/:itemId (T24, Bước 4). PostgreSQL thật + HTTP vào `app` thật. Không gọi AI.
 * Dữ liệu riêng (tiền tố "t24it_"), xóa sạch sau khi chạy. Cô lập bài bằng `blockForeign` như các test T24 khác.
 * Chạy tuần tự với các file DB test khác: npx.cmd vitest run --no-file-parallelism
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import type { ExerciseStatus, Level, Skill } from "@prisma/client";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const PREFIX = "t24it_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

const BASE_TIME = new Date("2026-01-01T00:00:00.000Z").getTime();
const at = (minute: number) => new Date(BASE_TIME + minute * 60_000);

const allUserIds: number[] = [];
const ex: Record<string, number> = {};
let ownerId = 0; // GV tạo bài + lớp + bài giao
let server: Server;
let baseUrl = "";

// ---------------------------------------------------------------------------
// Tạo / dọn dữ liệu
// ---------------------------------------------------------------------------
const createUser = async (
  label: string,
  role: "ADMIN" | "TEACHER" | "STUDENT",
  status: "ACTIVE" | "PENDING" | "LOCKED" = "ACTIVE"
) => {
  const user = await prisma.user.create({
    data: {
      name: `${RUN_ID} ${label}`,
      email: `${RUN_ID}_${label}@test.local`.toLowerCase(), // DB bắt buộc email chữ thường
      passwordHash: "not-a-real-hash",
      role,
      status,
    },
    select: { id: true },
  });
  allUserIds.push(user.id);
  return user.id;
};

let studentCounter = 0;
const newStudent = () => createUser(`student_${(studentCounter += 1)}`, "STUDENT");

const createExercise = async (
  key: string,
  opts: { skill: Skill; level: Level; minute: number; status?: ExerciseStatus; inLibrary?: boolean }
) => {
  const row = await prisma.exercise.create({
    data: {
      type: "fill_blank",
      skill: opts.skill,
      level: opts.level,
      topic: `${RUN_ID} ${key}`,
      content: { text: "CONTENT_MARKER ___" },
      answer: ["ANSWER_MARKER"],
      explanation: "EXPLANATION_MARKER",
      status: opts.status ?? "PUBLISHED",
      source: "ADMIN",
      inLibrary: opts.inLibrary ?? true,
      createdById: ownerId,
      createdAt: at(opts.minute),
    },
    select: { id: true },
  });
  ex[key] = row.id;
};

const addAttempt = (studentId: number, exerciseId: number, assignmentId: number | null = null) =>
  prisma.attempt.create({
    data: { studentId, exerciseId, assignmentId, answer: ["x"], score: 5, submittedAt: at(1000) },
  });

/** Cho HS "đã làm" mọi bài thư viện KHÔNG phải của test, để bài của người khác không lọt vào kết quả. */
const blockForeign = async (studentId: number) => {
  const mine = Object.values(ex);
  const foreign = await prisma.exercise.findMany({
    where: { status: "PUBLISHED", inLibrary: true, id: { notIn: mine }, attempts: { none: { studentId } } },
    select: { id: true },
  });
  if (foreign.length > 0) {
    await prisma.attempt.createMany({
      data: foreign.map((e) => ({ studentId, exerciseId: e.id, answer: ["x"], score: 5, submittedAt: at(1000) })),
    });
  }
};

// attempt có khóa ngoại RESTRICT nên xóa theo thứ tự: attempt -> bài giao -> lớp -> bài -> user
// (skill_profiles, learning_paths và class_members tự xóa theo user/lớp).
const cleanup = async (userIds: number[]) => {
  if (userIds.length === 0) return;
  await prisma.attempt.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.assignment.deleteMany({ where: { assignedById: { in: userIds } } });
  await prisma.class.deleteMany({ where: { teacherId: { in: userIds } } });
  const owned = await prisma.exercise.findMany({ where: { createdById: { in: userIds } }, select: { id: true } });
  await prisma.attempt.deleteMany({ where: { exerciseId: { in: owned.map((e: { id: number }) => e.id) } } });
  await prisma.exercise.deleteMany({ where: { createdById: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
};

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error("Không kết nối được database. Kiểm tra DATABASE_URL trong server/.env và PostgreSQL đang chạy.");
  }

  const leftovers = await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } });
  await cleanup(leftovers.map((u: { id: number }) => u.id));

  ownerId = await createUser("owner", "TEACHER");

  await createExercise("w1", { skill: "WRITING", level: "A1", minute: 1 });
  await createExercise("w2", { skill: "WRITING", level: "A1", minute: 2 });
  await createExercise("r1", { skill: "READING", level: "A1", minute: 3 });
  await createExercise("l1", { skill: "LISTENING", level: "A1", minute: 4 });
  await createExercise("s1", { skill: "SPEAKING", level: "A1", minute: 5 });
  await createExercise("f1", { skill: "FOUNDATION", level: "A1", minute: 6 });

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Không mở được server test");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await cleanup(allUserIds);
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Tiện ích gọi HTTP
// ---------------------------------------------------------------------------
interface PathData {
  id: number;
  week_start: string;
  created_at: string;
  items: { id: number; title: string; done: boolean; exercise: { id: number; type: string; skill: string; level: string; topic: string } | null }[];
  progress: { done: number; total: number };
}
interface ApiResult {
  status: number;
  rawText: string;
  body: { data: PathData | null; error: { code: string; message: string } | null };
}

const tokenOf = (userId: number) => jwt.sign({ userId }, env.JWT_SECRET);

const call = async (method: "GET" | "POST", auth?: string, body?: unknown): Promise<ApiResult> => {
  const headers: Record<string, string> = {};
  if (auth !== undefined) headers.Authorization = `Bearer ${auth}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${baseUrl}/api/v1/learning-path/me`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const rawText = await res.text();
  return { status: res.status, rawText, body: JSON.parse(rawText) };
};

const pathCount = (studentId: number) => prisma.learningPath.count({ where: { studentId } });
const itemCount = (studentId: number) => prisma.learningPathItem.count({ where: { path: { studentId } } });

/** HS mới đã bị chặn bài của người khác (chỉ bài của test còn là ứng viên). */
const readyStudent = async () => {
  const id = await newStudent();
  await blockForeign(id);
  return id;
};

// ---------------------------------------------------------------------------
// Tiện ích riêng cho PATCH
// ---------------------------------------------------------------------------
interface PatchResult {
  status: number;
  rawText: string;
  body: { data: PathData | null; error: { code: string; message: string } | null };
}

const patchItem = async (auth: string | undefined, itemId: string | number, body?: unknown): Promise<PatchResult> => {
  const headers: Record<string, string> = {};
  if (auth !== undefined) headers.Authorization = `Bearer ${auth}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${baseUrl}/api/v1/learning-path/items/${itemId}`, {
    method: "PATCH",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const rawText = await res.text();
  return { status: res.status, rawText, body: JSON.parse(rawText) };
};

/** HS mới + lộ trình tuần này đã tạo qua API. */
const studentWithPath = async () => {
  const id = await newStudent();
  await blockForeign(id);
  const created = await call("POST", tokenOf(id));
  expect(created.status).toBe(201);
  return { id, token: tokenOf(id), path: created.body.data! };
};

const NOT_EXISTING_ID = 2_147_483_647;

// ---------------------------------------------------------------------------
describe("Ma trận quyền", () => {
  it("không token / token sai chữ ký / hết hạn / user đã xóa -> 401", async () => {
    expect((await patchItem(undefined, 1, { done: true })).status).toBe(401);
    expect((await patchItem(jwt.sign({ userId: 1 }, "wrong-secret"), 1, { done: true })).status).toBe(401);
    expect((await patchItem(jwt.sign({ userId: 1 }, env.JWT_SECRET, { expiresIn: -10 }), 1, { done: true })).status).toBe(401);

    const ghost = await createUser("ghost", "STUDENT");
    const ghostToken = tokenOf(ghost);
    await prisma.user.delete({ where: { id: ghost } });
    expect((await patchItem(ghostToken, 1, { done: true })).status).toBe(401);
  });

  it("TEACHER / ADMIN / HS PENDING / HS LOCKED -> 403 (kể cả khi item có thật), item không đổi", async () => {
    const owner = await studentWithPath();
    const itemId = owner.path.items[0].id;
    const teacher = await createUser("teacher", "TEACHER");
    const admin = await createUser("admin", "ADMIN");
    const pending = await createUser("pending", "STUDENT", "PENDING");
    const locked = await createUser("locked", "STUDENT", "LOCKED");
    for (const id of [teacher, admin, pending, locked]) {
      const result = await patchItem(tokenOf(id), itemId, { done: true });
      expect(result.status).toBe(403);
      expect(result.body.data).toBeNull();
    }
    const row = await prisma.learningPathItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(row.done).toBe(false);
  });
});

describe("Kiểm tra đầu vào", () => {
  it("itemId sai định dạng -> 400 VALIDATION_ERROR", async () => {
    const { token } = await studentWithPath();
    for (const bad of ["abc", "0", "-1", "1.5", "1e3", "99999999999999999999", "2147483648"]) {
      const result = await patchItem(token, bad, { done: true });
      expect(result.status, `itemId=${bad}`).toBe(400);
      expect(result.body.error!.code).toBe("VALIDATION_ERROR");
    }
  });

  it("body sai (thiếu, sai kiểu, thừa field, không có body) -> 400 và item không đổi", async () => {
    const { token, path } = await studentWithPath();
    const itemId = path.items[0].id;
    const bodies: unknown[] = [{}, { done: "true" }, { done: 1 }, { done: null }, { done: true, title: "x" }, { done: true, exercise_id: 1 }, undefined];
    for (const body of bodies) {
      const result = await patchItem(token, itemId, body);
      expect(result.status, JSON.stringify(body)).toBe(400);
      expect(result.body.error!.code).toBe("VALIDATION_ERROR");
    }
    const row = await prisma.learningPathItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(row.done).toBe(false);
    expect(row.title).toBe(path.items[0].title);
  });
});

describe("Tick done", () => {
  it("true, lặp lại true, false, lặp lại false: đều 200, progress đúng, item khác không đổi", async () => {
    const { token, path } = await studentWithPath();
    const [first, second] = path.items;

    const t1 = await patchItem(token, first.id, { done: true });
    expect(t1.status).toBe(200);
    expect(t1.body.error).toBeNull();
    expect(t1.body.data!.id).toBe(path.id);
    expect(t1.body.data!.items.find((i) => i.id === first.id)!.done).toBe(true);
    expect(t1.body.data!.items.find((i) => i.id === second.id)!.done).toBe(false);
    expect(t1.body.data!.progress).toEqual({ done: 1, total: 5 });

    const t2 = await patchItem(token, first.id, { done: true }); // lặp lại
    expect(t2.status).toBe(200);
    expect(t2.body.data).toEqual(t1.body.data);

    await patchItem(token, second.id, { done: true });
    const both = await call("GET", token);
    expect(both.body.data!.progress).toEqual({ done: 2, total: 5 });

    const f1 = await patchItem(token, first.id, { done: false });
    expect(f1.status).toBe(200);
    expect(f1.body.data!.items.find((i) => i.id === first.id)!.done).toBe(false);
    expect(f1.body.data!.progress).toEqual({ done: 1, total: 5 });

    const f2 = await patchItem(token, first.id, { done: false }); // lặp lại
    expect(f2.status).toBe(200);
    expect(f2.body.data).toEqual(f1.body.data);
  });

  it("GET sau PATCH khớp response của PATCH; title và exercise không bị đổi", async () => {
    const { token, path } = await studentWithPath();
    const patched = await patchItem(token, path.items[2].id, { done: true });
    const got = await call("GET", token);
    expect(got.body.data).toEqual(patched.body.data);
    expect(got.body.data!.items.map((i) => ({ title: i.title, exercise: i.exercise }))).toEqual(
      path.items.map((i) => ({ title: i.title, exercise: i.exercise }))
    );
  });

  it("nhiều PATCH song song (cùng giá trị) đều 200 và kết quả nhất quán", async () => {
    const { token, path } = await studentWithPath();
    const itemId = path.items[0].id;
    const results = await Promise.all(Array.from({ length: 8 }, () => patchItem(token, itemId, { done: true })));
    expect(results.every((r) => r.status === 200)).toBe(true);
    const row = await prisma.learningPathItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(row.done).toBe(true);
  });

  it("item của lộ trình tuần cũ của chính mình vẫn tick được", async () => {
    const id = await newStudent();
    const oldPath = await prisma.learningPath.create({
      data: { studentId: id, weekStart: new Date("2026-01-05T00:00:00.000Z"), items: { create: [{ title: "Luyện Viết mức A1" }] } },
      include: { items: true },
    });
    const result = await patchItem(tokenOf(id), oldPath.items[0].id, { done: true });
    expect(result.status).toBe(200);
    expect(result.body.data!.id).toBe(oldPath.id);
    expect(result.body.data!.week_start).toBe("2026-01-05");
    expect(result.body.data!.items[0].exercise).toBeNull();
    expect(result.body.data!.progress).toEqual({ done: 1, total: 1 });
  });

  it("hình dạng response: không field thừa, không lộ content/answer/explanation/bí mật", async () => {
    const { token, path } = await studentWithPath();
    const result = await patchItem(token, path.items[0].id, { done: true });
    expect(Object.keys(result.body.data!).sort()).toEqual(["created_at", "id", "items", "progress", "week_start"]);
    for (const item of result.body.data!.items) {
      expect(Object.keys(item).sort()).toEqual(["done", "exercise", "id", "title"]);
    }
    for (const secret of ["CONTENT_MARKER", "ANSWER_MARKER", "EXPLANATION_MARKER", "passwordHash", "GEMINI_API_KEY", env.JWT_SECRET]) {
      expect(result.rawText).not.toContain(secret);
    }
  });
});

describe("Quyền sở hữu: 404 giống hệt nhau", () => {
  it("HS A sửa item của HS B -> 404, body giống hệt item không tồn tại, item của B không đổi", async () => {
    const a = await studentWithPath();
    const b = await studentWithPath();
    const bItem = b.path.items[0].id;

    const crossTenant = await patchItem(a.token, bItem, { done: true });
    const missing = await patchItem(a.token, NOT_EXISTING_ID, { done: true });

    expect(crossTenant.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(crossTenant.body).toEqual(missing.body);
    expect(crossTenant.rawText).toBe(missing.rawText);
    expect(crossTenant.body.error!.code).toBe("NOT_FOUND");
    expect(crossTenant.body.data).toBeNull();

    const row = await prisma.learningPathItem.findUniqueOrThrow({ where: { id: bItem } });
    expect(row.done).toBe(false);
    const bView = await call("GET", b.token);
    expect(bView.body.data).toEqual(b.path); // lộ trình của B nguyên vẹn
  });

  it("HS A đọc lộ trình của mình không thấy item của HS B", async () => {
    const a = await studentWithPath();
    const b = await studentWithPath();
    const aIds = new Set((await call("GET", a.token)).body.data!.items.map((i) => i.id));
    for (const item of b.path.items) expect(aIds.has(item.id)).toBe(false);
  });

  it("body 404 không lộ thông tin về item của người khác", async () => {
    const a = await studentWithPath();
    const b = await studentWithPath();
    const result = await patchItem(a.token, b.path.items[0].id, { done: true });
    expect(result.rawText).not.toContain(b.path.items[0].title);
    expect(result.rawText).not.toContain(String(b.path.id));
  });
});