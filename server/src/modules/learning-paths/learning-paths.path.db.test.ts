/**
 * Test tích hợp lộ trình tuần (T24, Bước 3): GET/POST /api/v1/learning-path/me. PostgreSQL thật + gọi HTTP vào `app` thật.
 * Không gọi AI. Dữ liệu riêng cho lần chạy (tiền tố "t24lp_"), xóa sạch sau khi chạy.
 *
 * CÁCH CÔ LẬP: giống recommendations.db.test.ts. `blockForeign` cho HS "đã làm" mọi bài thư viện không phải của test,
 * nên chỉ bài của test là ứng viên. HS mới không có hồ sơ kỹ năng -> cả 5 kỹ năng mức A1, xếp theo thứ tự enum.
 *
 * Bộ bài (A1, đều PUBLISHED + in_library): w1 w2 (WRITING), r1 (READING), l1 (LISTENING), s1 (SPEAKING), f1 (FOUNDATION),
 * hx (WRITING, sẽ bị ẩn trong test), dx (READING, sẽ bị xóa trong test).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import type { ExerciseStatus, Level, Skill } from "@prisma/client";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { createCurrentPath, getCurrentPath, saveWeeklyPath } from "./learning-paths.path.service";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const PREFIX = "t24lp_";
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
  await createExercise("hx", { skill: "WRITING", level: "A1", minute: 7 });
  await createExercise("dx", { skill: "READING", level: "A1", minute: 8 });

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
describe("Ma trận quyền (GET và POST)", () => {
  for (const method of ["GET", "POST"] as const) {
    it(`${method}: không token / token sai chữ ký / hết hạn / user đã xóa -> 401`, async () => {
      expect((await call(method)).status).toBe(401);
      expect((await call(method, jwt.sign({ userId: 1 }, "wrong-secret"))).status).toBe(401);
      expect((await call(method, jwt.sign({ userId: 1 }, env.JWT_SECRET, { expiresIn: -10 }))).status).toBe(401);

      const ghost = await createUser(`ghost_${method}`, "STUDENT");
      const ghostToken = tokenOf(ghost);
      await prisma.user.delete({ where: { id: ghost } });
      expect((await call(method, ghostToken)).status).toBe(401);
    });

    it(`${method}: TEACHER / ADMIN / HS PENDING / HS LOCKED -> 403`, async () => {
      const teacher = await createUser(`teacher_${method}`, "TEACHER");
      const admin = await createUser(`admin_${method}`, "ADMIN");
      const pending = await createUser(`pending_${method}`, "STUDENT", "PENDING");
      const locked = await createUser(`locked_${method}`, "STUDENT", "LOCKED");
      for (const id of [teacher, admin, pending, locked]) {
        const result = await call(method, tokenOf(id));
        expect(result.status).toBe(403);
        expect(result.body.data).toBeNull();
      }
      expect(await pathCount(pending)).toBe(0);
    });
  }
});

describe("GET /learning-path/me", () => {
  it("chưa tạo -> 200 và data = null", async () => {
    const id = await readyStudent();
    const result = await call("GET", tokenOf(id));
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ data: null, error: null });
  });
});

describe("POST /learning-path/me", () => {
  it("lần 1 -> 201 có items; lần 2 cùng tuần -> 200 đúng lộ trình cũ, không tăng số dòng; GET khớp", async () => {
    const id = await readyStudent();
    const first = await call("POST", tokenOf(id));
    expect(first.status).toBe(201);
    expect(first.body.error).toBeNull();
    expect(first.body.data!.items).toHaveLength(5); // mỗi kỹ năng 1 bài ở vòng 1 (đủ N = 5)
    expect(first.body.data!.progress).toEqual({ done: 0, total: 5 });
    expect(await pathCount(id)).toBe(1);
    expect(await itemCount(id)).toBe(5);

    const second = await call("POST", tokenOf(id), {});
    expect(second.status).toBe(200);
    expect(second.body.data).toEqual(first.body.data);
    expect(await pathCount(id)).toBe(1);
    expect(await itemCount(id)).toBe(5);

    const got = await call("GET", tokenOf(id));
    expect(got.status).toBe(200);
    expect(got.body.data).toEqual(first.body.data);
  });

  it("nhiều POST song song -> đúng 1 lộ trình, đúng 1 bộ items, đúng 1 phản hồi 201", async () => {
    const id = await readyStudent();
    const results = await Promise.all(Array.from({ length: 8 }, () => call("POST", tokenOf(id))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 200)).toHaveLength(7);
    expect(new Set(results.map((r) => r.body.data!.id)).size).toBe(1);
    expect(await pathCount(id)).toBe(1);
    expect(await itemCount(id)).toBe(5);
  });

  it("không có bài phù hợp -> 422 NO_EXERCISES_AVAILABLE, 0 dòng ở cả hai bảng", async () => {
    const id = await newStudent();
    await blockForeign(id);
    for (const exerciseId of Object.values(ex)) await addAttempt(id, exerciseId);
    await blockForeign(id); // chặn lại ngay trước khi gọi, phòng bài mới xuất hiện giữa chừng
    const result = await call("POST", tokenOf(id));
    const leaked = result.body.data?.items.map((i) => i.exercise?.topic);
    expect(result.status, `Bài lọt vào lộ trình: ${JSON.stringify(leaked)}`).toBe(422);
    expect(result.body.data).toBeNull();
    expect(result.body.error!.code).toBe("NO_EXERCISES_AVAILABLE");
    expect(await pathCount(id)).toBe(0);
    expect(await itemCount(id)).toBe(0);
  });

  it("gửi field lạ (title, exercise_id, week_start, student_id) -> 400 và không tạo gì", async () => {
    const id = await readyStudent();
    for (const body of [{ title: "x" }, { exercise_id: 1 }, { week_start: "2026-01-05" }, { student_id: 1 }]) {
      const result = await call("POST", tokenOf(id), body);
      expect(result.status).toBe(400);
      expect(result.body.error!.code).toBe("VALIDATION_ERROR");
    }
    expect(await pathCount(id)).toBe(0);
  });

  it("hình dạng response: không có field thừa, không lộ content/answer/explanation/bí mật", async () => {
    const id = await readyStudent();
    const result = await call("POST", tokenOf(id));
    const data = result.body.data!;
    expect(Object.keys(data).sort()).toEqual(["created_at", "id", "items", "progress", "week_start"]);
    expect(data.week_start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(data.created_at).toISOString()).toBe(data.created_at);
    for (const item of data.items) {
      expect(Object.keys(item).sort()).toEqual(["done", "exercise", "id", "title"]);
      expect(item.done).toBe(false);
      expect(item.title).toMatch(/^Luyện (Nghe|Nói|Đọc|Viết|Nền tảng) mức A1$/);
      expect(Object.keys(item.exercise!).sort()).toEqual(["id", "level", "skill", "topic", "type"]);
    }
    for (const secret of ["CONTENT_MARKER", "ANSWER_MARKER", "EXPLANATION_MARKER", "passwordHash", "GEMINI_API_KEY", env.JWT_SECRET]) {
      expect(result.rawText).not.toContain(secret);
    }
  });

  it("HS A không thấy dữ liệu của HS B", async () => {
    const a = await readyStudent();
    const b = await readyStudent();
    const pathA = (await call("POST", tokenOf(a))).body.data!;
    expect((await call("GET", tokenOf(b))).body.data).toBeNull();
    const pathB = (await call("POST", tokenOf(b))).body.data!;
    expect(pathB.id).not.toBe(pathA.id);
    expect((await call("GET", tokenOf(a))).body.data!.id).toBe(pathA.id);
    expect((await call("GET", tokenOf(b))).body.data!.id).toBe(pathB.id);
  });
});

describe("Theo tuần (mức service, tham số now)", () => {
  const TZ = "Asia/Ho_Chi_Minh";

  it("cùng tuần thì trả lộ trình cũ; sang tuần mới thì tạo lộ trình mới", async () => {
    const id = await readyStudent();
    const monday = new Date("2026-11-16T03:00:00.000Z"); // thứ Hai 10:00 giờ VN
    const wednesday = new Date("2026-11-18T03:00:00.000Z");
    const nextMonday = new Date("2026-11-23T03:00:00.000Z");

    const w1 = await createCurrentPath(id, monday, TZ);
    expect(w1.created).toBe(true);
    expect(w1.path.week_start).toBe("2026-11-16");

    const sameWeek = await createCurrentPath(id, wednesday, TZ);
    expect(sameWeek.created).toBe(false);
    expect(sameWeek.path.id).toBe(w1.path.id);

    expect(await getCurrentPath(id, nextMonday, TZ)).toBeNull();
    const w2 = await createCurrentPath(id, nextMonday, TZ);
    expect(w2.created).toBe(true);
    expect(w2.path.week_start).toBe("2026-11-23");
    expect(w2.path.id).not.toBe(w1.path.id);
    expect(await pathCount(id)).toBe(2);
  });

  it("đã có lộ trình tuần cũ sẵn thì vẫn tạo được lộ trình tuần này", async () => {
    const id = await readyStudent();
    await prisma.learningPath.create({ data: { studentId: id, weekStart: new Date("2026-11-09T00:00:00.000Z") } });
    const now = new Date("2026-11-16T03:00:00.000Z");
    const result = await createCurrentPath(id, now, TZ);
    expect(result.created).toBe(true);
    expect(result.path.week_start).toBe("2026-11-16");
    expect(await pathCount(id)).toBe(2);
  });

  it("Chủ nhật 20:00 UTC đã là thứ Hai ở Việt Nam -> thuộc tuần mới", async () => {
    const id = await readyStudent();
    const result = await createCurrentPath(id, new Date("2026-11-22T20:00:00.000Z"), TZ); // 03:00 thứ Hai 23/11 giờ VN
    expect(result.path.week_start).toBe("2026-11-23");
  });
});

describe("saveWeeklyPath (hàm lưu dùng chung với bản AI)", () => {
  const WEEK = new Date("2026-11-16T00:00:00.000Z");

  it("tạo đúng thứ tự đã đưa (id tăng dần), title nguyên văn, đúng bài, done=false", async () => {
    const id = await readyStudent();
    const order = [ex.r1, ex.w2, ex.w1]; // thứ tự KHÁC thứ tự bản luật để chứng minh hàm giữ nguyên thứ tự được đưa
    const titles = ["Bài đọc trước", "Viết thứ hai", "Viết đầu"];

    const result = await saveWeeklyPath(id, WEEK, order.map((exerciseId, i) => ({ title: titles[i], exerciseId })));

    expect(result.created).toBe(true);
    expect(result.path.week_start).toBe("2026-11-16");
    expect(result.path.items.map((item) => item.title)).toEqual(titles);
    expect(result.path.items.map((item) => item.exercise?.id)).toEqual(order);
    expect(result.path.items.every((item) => item.done === false)).toBe(true);
    const ids = result.path.items.map((item) => item.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
    expect(await pathCount(id)).toBe(1);
    expect(await itemCount(id)).toBe(3);
  });

  it("tuần đó đã có lộ trình -> trả lộ trình cũ (created=false), không ghi thêm dòng nào", async () => {
    const id = await readyStudent();
    const first = await saveWeeklyPath(id, WEEK, [{ title: "Một", exerciseId: ex.w1 }]);
    const second = await saveWeeklyPath(id, WEEK, [{ title: "Hai", exerciseId: ex.r1 }, { title: "Ba", exerciseId: ex.l1 }]);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.path).toEqual(first.path);
    expect(await pathCount(id)).toBe(1);
    expect(await itemCount(id)).toBe(1);
  });

  it("gọi song song -> đúng 1 lộ trình, đúng 1 lần created=true, mọi bên thấy cùng một lộ trình", async () => {
    const id = await readyStudent();
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => saveWeeklyPath(id, WEEK, [{ title: `Lần ${i}`, exerciseId: ex.w1 }]))
    );

    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.path.id)).size).toBe(1);
    expect(await pathCount(id)).toBe(1);
    expect(await itemCount(id)).toBe(1);
  });

  it("danh sách rỗng -> NO_EXERCISES_AVAILABLE, 0 dòng DB (không bao giờ tạo lộ trình rỗng)", async () => {
    const id = await readyStudent();
    await expect(saveWeeklyPath(id, WEEK, [])).rejects.toThrow("NO_EXERCISES_AVAILABLE");
    expect(await pathCount(id)).toBe(0);
    expect(await itemCount(id)).toBe(0);
  });
});

describe("Bài bị ẩn hoặc xóa sau khi tạo lộ trình", () => {
  it("HIDDEN -> exercise: null; xóa bài (FK SET NULL) -> item vẫn còn, exercise: null (để cuối file vì xóa bài)", async () => {
    // HS này chỉ còn hai ứng viên là hx và dx.
    const id = await newStudent();
    const others = Object.entries(ex)
      .filter(([key]) => key !== "hx" && key !== "dx")
      .map(([, exerciseId]) => exerciseId);
    await blockForeign(id);
    for (const exerciseId of others) await addAttempt(id, exerciseId);

    const created = await call("POST", tokenOf(id));
    expect(created.status).toBe(201);
    expect(created.body.data!.items.map((i) => i.exercise?.id).sort()).toEqual([ex.hx, ex.dx].sort());

    await prisma.exercise.update({ where: { id: ex.hx }, data: { status: "HIDDEN" as ExerciseStatus } });
    const afterHide = await call("GET", tokenOf(id));
    expect(afterHide.body.data!.items).toHaveLength(2);
    expect(afterHide.body.data!.items.filter((i) => i.exercise === null)).toHaveLength(1);

    await prisma.attempt.deleteMany({ where: { exerciseId: ex.dx } }); // attempt có FK RESTRICT
    await prisma.exercise.delete({ where: { id: ex.dx } });
    delete ex.dx;
    const afterDelete = await call("GET", tokenOf(id));
    expect(afterDelete.status).toBe(200);
    expect(afterDelete.body.data!.items).toHaveLength(2);
    expect(afterDelete.body.data!.items.every((i) => i.exercise === null)).toBe(true);
    expect(afterDelete.body.data!.progress).toEqual({ done: 0, total: 2 });
  });
});