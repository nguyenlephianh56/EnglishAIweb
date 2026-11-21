/**
 * Test tích hợp API "Gợi ý cho bạn" (T24): PostgreSQL thật + gọi HTTP vào `app` thật. Không gọi AI.
 *
 * - Dùng DATABASE_URL trong .env. Dữ liệu tạo bằng Prisma, riêng cho lần chạy này (tiền tố "t24rc_"), xóa sạch sau khi chạy.
 * - CÁCH CÔ LẬP: DB thật có thể đã có bài PUBLISHED + in_library của người khác. Mỗi HS test được tạo thêm attempt
 *   "đã làm" cho MỌI bài thư viện không phải của test (hàm `blockForeign`), nên chỉ bài của test mới còn là ứng viên.
 *   Hồ sơ kỹ năng được tạo thẳng bằng Prisma (không qua T14) để điều khiển điểm/mức chính xác.
 *
 * Bộ dữ liệu bài (mốc created_at tăng dần theo thứ tự khai báo):
 *   WRITING A1: w1 w2 w3 | WRITING A2: wA2 | READING A1: r1 r2
 *   READING A1 nhưng KHÔNG đủ điều kiện: rDraft (DRAFT) rProposed (PROPOSED) rHidden (HIDDEN) rNotLib (in_library=false)
 *   LISTENING A1: l1 | LISTENING B1: lB1 | SPEAKING A1: s1 | FOUNDATION A1: f1
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import type { ExerciseStatus, Level, Skill } from "@prisma/client";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const PREFIX = "t24rc_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

const BASE_TIME = new Date("2026-01-01T00:00:00.000Z").getTime();
const at = (minute: number) => new Date(BASE_TIME + minute * 60_000);

const allUserIds: number[] = [];
const ex: Record<string, number> = {};
let ownerId = 0; // GV tạo bài + lớp + bài giao
let classId = 0;
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
      email: `${RUN_ID}_${label}@test.local`,
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

const setProfile = (
  studentId: number,
  skill: Skill,
  score: number,
  level: Level | null,
  errorStats: Prisma.InputJsonValue = {}
) => prisma.skillProfile.create({ data: { studentId, skill, score, level, errorStats } });

const addAttempt = (studentId: number, exerciseId: number, assignmentId: number | null = null) =>
  prisma.attempt.create({
    data: { studentId, exerciseId, assignmentId, answer: ["x"], score: 5, submittedAt: at(1000) },
  });

/** Cho HS "đã làm" mọi bài thư viện KHÔNG phải của test, để bài của người khác không lọt vào kết quả. */
const blockForeign = async (studentId: number) => {
  const mine = Object.values(ex);
  const foreign = await prisma.exercise.findMany({
    where: { status: "PUBLISHED", inLibrary: true, id: { notIn: mine } },
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

const makeClassCode = () => {
  let code = "";
  while (code.length < 6) code += Math.random().toString(36).slice(2).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.slice(0, 6);
};

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error("Không kết nối được database. Kiểm tra DATABASE_URL trong server/.env và PostgreSQL đang chạy.");
  }

  // Dọn dữ liệu còn sót của lần chạy trước bị ngắt giữa chừng.
  const leftovers = await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } });
  await cleanup(leftovers.map((u: { id: number }) => u.id));

  ownerId = await createUser("owner", "TEACHER");
  classId = (
    await prisma.class.create({
      data: { name: `${RUN_ID} class`, code: makeClassCode(), teacherId: ownerId },
      select: { id: true },
    })
  ).id;

  await createExercise("w1", { skill: "WRITING", level: "A1", minute: 1 });
  await createExercise("w2", { skill: "WRITING", level: "A1", minute: 2 });
  await createExercise("w3", { skill: "WRITING", level: "A1", minute: 3 });
  await createExercise("wA2", { skill: "WRITING", level: "A2", minute: 4 });
  await createExercise("r1", { skill: "READING", level: "A1", minute: 5 });
  await createExercise("r2", { skill: "READING", level: "A1", minute: 6 });
  await createExercise("rDraft", { skill: "READING", level: "A1", minute: 7, status: "DRAFT", inLibrary: false });
  await createExercise("rProposed", { skill: "READING", level: "A1", minute: 8, status: "PROPOSED", inLibrary: false });
  await createExercise("rHidden", { skill: "READING", level: "A1", minute: 9, status: "HIDDEN", inLibrary: true });
  await createExercise("rNotLib", { skill: "READING", level: "A1", minute: 10, status: "PUBLISHED", inLibrary: false });
  await createExercise("l1", { skill: "LISTENING", level: "A1", minute: 11 });
  await createExercise("lB1", { skill: "LISTENING", level: "B1", minute: 12 });
  await createExercise("s1", { skill: "SPEAKING", level: "A1", minute: 13 });
  await createExercise("f1", { skill: "FOUNDATION", level: "A1", minute: 14 });

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
// Hàm tiện ích gọi HTTP
// ---------------------------------------------------------------------------
interface RecItem {
  exercise: { id: number; type: string; skill: string; level: string; topic: string };
  reason: string;
  focus_error_type: string | null;
}
interface ApiResult {
  status: number;
  rawText: string;
  body: { data: RecItem[] | null; error: { code: string; message: string } | null };
}

const tokenOf = (userId: number) => jwt.sign({ userId }, env.JWT_SECRET);

const getRecs = async (query = "", auth?: string): Promise<ApiResult> => {
  const headers: Record<string, string> = {};
  if (auth !== undefined) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(`${baseUrl}/api/v1/recommendations/me${query}`, { headers });
  const rawText = await res.text();
  return { status: res.status, rawText, body: JSON.parse(rawText) };
};

/** Gọi với token của một user (đã đăng nhập). */
const asUser = (userId: number, query = "") => getRecs(query, tokenOf(userId));

const dataOf = (result: ApiResult): RecItem[] => {
  if (result.body.data === null) throw new Error(`Không có data (status ${result.status}): ${result.rawText}`);
  return result.body.data;
};

const idsOf = (result: ApiResult) => dataOf(result).map((item) => item.exercise.id);
const keysOf = (...names: string[]) => names.map((name) => ex[name]);

/** HS mới đã chặn bài của người khác (sẵn sàng để gọi API). */
const isolatedStudent = async () => {
  const id = await newStudent();
  await blockForeign(id);
  return id;
};

// ---------------------------------------------------------------------------
// Chọn bài
// ---------------------------------------------------------------------------
describe("GET /recommendations/me: chọn bài", () => {
  it("HS chưa có hồ sơ: toàn no_data_skill, mức A1, theo thứ tự enum, limit mặc định 5", async () => {
    const student = await isolatedStudent();
    const result = await asUser(student);

    expect(result.status).toBe(200);
    expect(result.body.error).toBeNull();
    expect(idsOf(result)).toEqual(keysOf("l1", "s1", "r1", "w1", "f1"));
    for (const item of dataOf(result)) {
      expect(item.reason).toBe("no_data_skill");
      expect(item.focus_error_type).toBeNull();
      expect(item.exercise.level).toBe("A1");
    }
  });

  it("limit=10: tối đa M = 2 bài mỗi kỹ năng; không bao giờ có bài DRAFT/PROPOSED/HIDDEN/in_library=false", async () => {
    const student = await isolatedStudent();
    const result = await asUser(student, "?limit=10");

    // vòng 1: l1 s1 r1 w1 f1; vòng 2: (LISTENING/SPEAKING/FOUNDATION hết bài A1) r2 w2; w3 bị cắt vì M = 2
    expect(idsOf(result)).toEqual(keysOf("l1", "s1", "r1", "w1", "f1", "r2", "w2"));
    const excluded = keysOf("rDraft", "rProposed", "rHidden", "rNotLib", "w3", "lB1", "wA2");
    for (const id of idsOf(result)) expect(excluded).not.toContain(id);
  });

  it("kỹ năng yếu nhất trước, reason/focus_error_type theo hồ sơ; type lỗi sai dạng bị bỏ qua", async () => {
    const student = await isolatedStudent();
    await setProfile(student, "WRITING", 2, "A1", { "grammar:tense": 3, vocab: 1, "lỗi lạ!": 99 });
    await setProfile(student, "READING", 6, "A1", {});
    const result = await asUser(student, "?limit=10");
    const data = dataOf(result);

    expect(idsOf(result)).toEqual(keysOf("w1", "r1", "l1", "s1", "f1", "w2", "r2"));
    expect(data[0]).toMatchObject({ reason: "weakest_skill", focus_error_type: "grammar:tense" });
    expect(data[1]).toMatchObject({ reason: "weakest_skill", focus_error_type: null });
    expect(data[2]).toMatchObject({ reason: "no_data_skill", focus_error_type: null });
  });

  it("mức mục tiêu = level hiện tại của kỹ năng (không mở rộng sang mức khác)", async () => {
    const student = await isolatedStudent();
    await setProfile(student, "WRITING", 5, "A2");
    await setProfile(student, "LISTENING", 7, "B1");
    const result = await asUser(student, "?limit=10");

    // WRITING A2 -> chỉ wA2 (không lấy w1..w3 mức A1); LISTENING B1 -> chỉ lB1 (không lấy l1)
    expect(idsOf(result)).toEqual(keysOf("wA2", "lB1", "s1", "r1", "f1", "r2"));
  });

  it("kỹ năng có điểm nhưng level null: vẫn xếp theo điểm, mức mục tiêu A1", async () => {
    const student = await isolatedStudent();
    await setProfile(student, "FOUNDATION", 1, null);
    const result = await asUser(student, "?limit=3");
    expect(idsOf(result)).toEqual(keysOf("f1", "l1", "s1"));
    expect(dataOf(result)[0].reason).toBe("weakest_skill");
  });

  it("loại bài HS đã làm (cả bài giao lẫn tự luyện); attempt của HS khác không ảnh hưởng", async () => {
    const student = await isolatedStudent();
    const other = await isolatedStudent();

    const assignment = await prisma.assignment.create({
      data: { exerciseId: ex.r1, classId, assignedById: ownerId, dueAt: at(5000) },
      select: { id: true },
    });
    await addAttempt(student, ex.w1); // tự luyện
    await addAttempt(student, ex.r1, assignment.id); // bài giao
    await addAttempt(other, ex.l1); // HS khác làm l1: KHÔNG được loại l1 khỏi gợi ý của `student`

    const result = await asUser(student, "?limit=10");
    // WRITING còn w2, w3; READING còn r2; l1 vẫn còn
    expect(idsOf(result)).toEqual(keysOf("l1", "s1", "r2", "w2", "f1", "w3"));
  });

  it("kỹ năng hết bài thì bị bỏ qua; HS đã làm hết bài thì nhận mảng rỗng (200)", async () => {
    const skipF = await isolatedStudent();
    await addAttempt(skipF, ex.f1);
    const resultSkip = await asUser(skipF, "?limit=10");
    expect(idsOf(resultSkip)).toEqual(keysOf("l1", "s1", "r1", "w1", "r2", "w2"));
    expect(dataOf(resultSkip).some((item) => item.exercise.skill === "FOUNDATION")).toBe(false);

    const doneAll = await isolatedStudent();
    for (const name of ["w1", "w2", "w3", "r1", "r2", "l1", "s1", "f1"]) await addAttempt(doneAll, ex[name]);
    const resultEmpty = await asUser(doneAll, "?limit=10");
    expect(resultEmpty.status).toBe(200);
    expect(resultEmpty.body.data).toEqual([]);
    expect(resultEmpty.body.error).toBeNull();
  });

  it("limit cắt đúng số bài; gọi hai lần cho kết quả giống hệt (tất định)", async () => {
    const student = await isolatedStudent();
    const three = await asUser(student, "?limit=3");
    expect(idsOf(three)).toEqual(keysOf("l1", "s1", "r1"));

    const first = await asUser(student, "?limit=10");
    const second = await asUser(student, "?limit=10");
    expect(second.body).toEqual(first.body);
  });

  it("bài bị ẩn sau đó (HIDDEN) biến khỏi gợi ý ngay", async () => {
    const student = await isolatedStudent();
    await prisma.exercise.update({ where: { id: ex.f1 }, data: { status: "HIDDEN" } });
    try {
      const result = await asUser(student);
      expect(idsOf(result)).not.toContain(ex.f1);
      expect(idsOf(result)).toEqual(keysOf("l1", "s1", "r1", "w1", "r2"));
    } finally {
      await prisma.exercise.update({ where: { id: ex.f1 }, data: { status: "PUBLISHED" } });
    }
  });

  it("chỉ dùng student_id từ token: tham số student_id/studentId trên URL bị bỏ qua", async () => {
    const weak = await isolatedStudent();
    const fresh = await isolatedStudent();
    await setProfile(weak, "WRITING", 1, "A1");

    const own = await asUser(weak);
    const spoof = await asUser(weak, `?studentId=${fresh}&student_id=${fresh}`);
    expect(spoof.body).toEqual(own.body);
    expect(idsOf(own)[0]).toBe(ex.w1); // hồ sơ của `weak`, không phải của `fresh` (fresh sẽ bắt đầu bằng l1)

    const freshResult = await asUser(fresh);
    expect(idsOf(freshResult)[0]).toBe(ex.l1);
  });
});

// ---------------------------------------------------------------------------
// Kiểm tra `limit`
// ---------------------------------------------------------------------------
describe("GET /recommendations/me: limit", () => {
  it("limit sai -> 400 VALIDATION_ERROR", async () => {
    const student = await isolatedStudent();
    for (const query of ["?limit=0", "?limit=11", "?limit=abc", "?limit=2.5", "?limit=", "?limit=-1", "?limit=1&limit=2"]) {
      const result = await asUser(student, query);
      expect(result.status, query).toBe(400);
      expect(result.body.data).toBeNull();
      expect(result.body.error?.code, query).toBe("VALIDATION_ERROR");
    }
  });

  it("limit=1 và limit=10 hợp lệ", async () => {
    const student = await isolatedStudent();
    expect(dataOf(await asUser(student, "?limit=1"))).toHaveLength(1);
    expect((await asUser(student, "?limit=10")).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Che đáp án, không lộ, không ghi DB
// ---------------------------------------------------------------------------
describe("GET /recommendations/me: dữ liệu trả về", () => {
  it("exercise chỉ có {id,type,skill,level,topic}; không lộ content/answer/explanation/passwordHash/khóa", async () => {
    const student = await isolatedStudent();
    const result = await asUser(student, "?limit=10");
    const data = dataOf(result);
    expect(data.length).toBeGreaterThan(0);

    for (const item of data) {
      expect(Object.keys(item).sort()).toEqual(["exercise", "focus_error_type", "reason"]);
      expect(Object.keys(item.exercise).sort()).toEqual(["id", "level", "skill", "topic", "type"]);
    }
    for (const forbidden of [
      "CONTENT_MARKER",
      "ANSWER_MARKER",
      "EXPLANATION_MARKER",
      "passwordHash",
      "password_hash",
      "JWT_SECRET",
      "GEMINI_API_KEY",
      env.JWT_SECRET,
    ]) {
      expect(result.rawText).not.toContain(forbidden);
    }
    expect(result.body.error).toBeNull();
  });

  it("GET không ghi DB: không tạo learning_paths/items, không đổi skill_profiles", async () => {
    const student = await isolatedStudent();
    await setProfile(student, "WRITING", 3, "A1", { vocab: 2 });
    const profileBefore = await prisma.skillProfile.findMany({ where: { studentId: student } });
    const attemptsBefore = await prisma.attempt.count({ where: { studentId: student } });

    await asUser(student, "?limit=10");
    await asUser(student);

    expect(await prisma.learningPath.count({ where: { studentId: student } })).toBe(0);
    expect(await prisma.learningPathItem.count({ where: { path: { studentId: student } } })).toBe(0);
    expect(await prisma.skillProfile.findMany({ where: { studentId: student } })).toEqual(profileBefore);
    expect(await prisma.attempt.count({ where: { studentId: student } })).toBe(attemptsBefore);
  });
});

// ---------------------------------------------------------------------------
// Phân quyền (T22: 401 / 403)
// ---------------------------------------------------------------------------
describe("GET /recommendations/me: phân quyền", () => {
  it("không token -> 401; token hỏng/sai chữ ký/hết hạn -> 401", async () => {
    const student = await newStudent();

    const none = await getRecs();
    expect(none.status).toBe(401);
    expect(none.body.data).toBeNull();

    expect((await getRecs("", "not-a-jwt")).status).toBe(401);
    expect((await getRecs("", jwt.sign({ userId: student }, "mot-khoa-bi-mat-khac-hoan-toan"))).status).toBe(401);
    expect((await getRecs("", jwt.sign({ userId: student }, env.JWT_SECRET, { expiresIn: -60 }))).status).toBe(401);
  });

  it("token hợp lệ nhưng tài khoản đã bị xóa -> 401", async () => {
    const gone = await newStudent();
    const token = tokenOf(gone);
    await prisma.user.delete({ where: { id: gone } });
    expect((await getRecs("", token)).status).toBe(401);
  });

  it("TEACHER và ADMIN -> 403 (kể cả khi limit sai: vai trò được kiểm trước)", async () => {
    const teacher = await createUser("teacher_x", "TEACHER");
    const admin = await createUser("admin_x", "ADMIN");
    for (const userId of [teacher, admin]) {
      const result = await asUser(userId);
      expect(result.status).toBe(403);
      expect(result.body.data).toBeNull();
      expect(result.body.error?.code).toBe("FORBIDDEN");
      expect((await asUser(userId, "?limit=abc")).status).toBe(403);
    }
  });

  it("HS PENDING hoặc LOCKED có token hợp lệ -> 403", async () => {
    const pending = await createUser("student_pending", "STUDENT", "PENDING");
    const locked = await createUser("student_locked", "STUDENT", "LOCKED");
    expect((await asUser(pending)).status).toBe(403);
    expect((await asUser(locked)).status).toBe(403);
  });
});