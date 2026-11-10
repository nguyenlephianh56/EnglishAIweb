/**
 * Test tích hợp POST /api/v1/attempts: bài giao (assignmentId) + tự luyện (không hồi quy).
 * Gọi API thật (HTTP) + DB PostgreSQL thật, dữ liệu assignment tạo thẳng bằng Prisma
 * (chưa có API giao bài - T5).
 *
 * - Dùng DATABASE_URL trong .env.
 * - Tự tạo user/lớp/bài/assignment riêng, xóa sạch sau khi chạy.
 * - Tiền tố "t4as_" riêng để không xóa nhầm dữ liệu của test khác.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";

const PREFIX = "t4as_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

// Chuỗi "đặc biệt" để dò rò rỉ: nếu response trước hạn chứa chúng thì đã lộ đáp án.
const SECRET_ANSWER = "zebraquux";
const SECRET_EXPLANATION = "EXPL_secret_zebra";
const WRONG_ANSWER = "wrongword";
const MC_RIGHT_OPTION = "bravo_secret"; // đáp án đúng của câu trắc nghiệm
const MC_WRONG_OPTION = "charlie_pick"; // lựa chọn sai của HS

const users = { admin: 0, teacher: 0, student: 0, outsider: 0 };
const ids = { classA: 0, classB: 0 };

let server: Server;
let baseUrl = "";

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

// Mã lớp: 6 ký tự HOA/số (DB có CHECK).
const randomClassCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

const createClass = async (name: string) => {
  const row = await prisma.class.create({
    data: {
      name: `${RUN_ID} ${name}`,
      code: randomClassCode(),
      teacherId: users.teacher,
    },
    select: { id: true },
  });
  return row.id;
};

type Status = "DRAFT" | "PROPOSED" | "PUBLISHED" | "HIDDEN";

const newFillBlank = async (status: Status, inLibrary = false) => {
  const row = await prisma.exercise.create({
    data: {
      type: "fill_blank",
      skill: "FOUNDATION",
      level: "A1",
      topic: `${RUN_ID} fill_blank`,
      content: { text: "She ___ to school." },
      answer: [SECRET_ANSWER],
      explanation: SECRET_EXPLANATION,
      status,
      source: "TEACHER",
      inLibrary,
      createdById: users.teacher,
    },
    select: { id: true },
  });
  return row.id;
};

const newMultipleChoice = async (status: Status) => {
  const row = await prisma.exercise.create({
    data: {
      type: "multiple_choice",
      skill: "READING",
      level: "A1",
      topic: `${RUN_ID} multiple_choice`,
      content: {
        questions: [
          { q: "Pick one", options: ["alpha", MC_RIGHT_OPTION, MC_WRONG_OPTION] },
        ],
      },
      answer: [1],
      explanation: SECRET_EXPLANATION,
      status,
      source: "TEACHER",
      inLibrary: false,
      createdById: users.teacher,
    },
    select: { id: true },
  });
  return row.id;
};

/** Tạo assignment trực tiếp bằng Prisma. dueOffsetMs: dương = hạn ở tương lai, âm = đã qua. */
const newAssignment = async (
  classId: number,
  exerciseId: number,
  dueOffsetMs: number
) => {
  const row = await prisma.assignment.create({
    data: {
      exerciseId,
      classId,
      assignedById: users.teacher,
      dueAt: new Date(Date.now() + dueOffsetMs),
    },
    select: { id: true, dueAt: true },
  });
  return row;
};

const HOUR = 60 * 60 * 1000;

const cleanup = async (userIds: number[]) => {
  if (userIds.length === 0) return;
  // Thứ tự: attempts -> lớp (cascade xóa assignments + class_members) -> bài -> user
  await prisma.attempt.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.class.deleteMany({ where: { teacherId: { in: userIds } } });
  await prisma.exercise.deleteMany({ where: { createdById: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
};

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;

  const leftovers = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  await cleanup(leftovers.map((u) => u.id));

  users.admin = await createUser("admin", "ADMIN");
  users.teacher = await createUser("teacher", "TEACHER");
  users.student = await createUser("student", "STUDENT");
  users.outsider = await createUser("outsider", "STUDENT");

  // Lớp A: có student. Lớp B: chỉ có outsider (student KHÔNG thuộc lớp B).
  ids.classA = await createClass("class_a");
  ids.classB = await createClass("class_b");
  await prisma.classMember.create({
    data: { classId: ids.classA, studentId: users.student },
  });
  await prisma.classMember.create({
    data: { classId: ids.classB, studentId: users.outsider },
  });

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Không mở được server test");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await cleanup(Object.values(users).filter((id) => id > 0));
  await prisma.$disconnect();
});

const tokenOf = (userId: number) => jwt.sign({ userId }, env.JWT_SECRET);

interface ApiResult {
  status: number;
  body: {
    data: Record<string, unknown> | null;
    error: { code: string; message: string } | null;
  };
}

const postAttempt = async (
  body: unknown,
  userId?: number
): Promise<ApiResult> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userId !== undefined) headers.Authorization = `Bearer ${tokenOf(userId)}`;

  const res = await fetch(`${baseUrl}/api/v1/attempts`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

const countAttempts = () =>
  prisma.attempt.count({
    where: { studentId: { in: [users.student, users.outsider] } },
  });

const readAttempt = async (attemptId: unknown) => {
  const row = await prisma.attempt.findUnique({
    where: { id: attemptId as number },
  });
  if (!row) throw new Error(`Không thấy attempt id=${String(attemptId)} trong DB`);
  return row;
};

const errorsOf = (data: Record<string, unknown> | null) =>
  (data?.errors ?? []) as Array<Record<string, unknown>>;

// ---------------------------------------------------------------------------
describe("Tự luyện (không có assignmentId): không hồi quy", () => {
  it("201: assignment_id null, is_late false, lộ đáp án ngay", async () => {
    const exerciseId = await newFillBlank("PUBLISHED", true);
    const res = await postAttempt(
      { exerciseId, answer: [WRONG_ANSWER] },
      users.student
    );

    expect(res.status).toBe(201);
    const row = await readAttempt(res.body.data?.attemptId);
    expect(row.studentId).toBe(users.student);
    expect(row.assignmentId).toBeNull();
    expect(row.isLate).toBe(false);
    expect(row.mode).toBe("practice");
    expect(row.score).toBe(0);

    expect(res.body.data?.answer).toEqual([SECRET_ANSWER]);
    expect(res.body.data?.explanation).toBe(SECRET_EXPLANATION);
    const errors = errorsOf(res.body.data);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].correction).toBe(SECRET_ANSWER);
  });

  it("201: làm đúng thì điểm 10", async () => {
    const exerciseId = await newFillBlank("PUBLISHED", true);
    const res = await postAttempt(
      { exerciseId, answer: [SECRET_ANSWER] },
      users.student
    );
    expect(res.status).toBe(201);
    expect(res.body.data?.score).toBe(10);
  });

  it("404: bài DRAFT / ngoài thư viện không tự luyện được", async () => {
    const draft = await newFillBlank("DRAFT", false);
    const notInLib = await newFillBlank("PUBLISHED", false);
    const before = await countAttempts();

    for (const exerciseId of [draft, notInLib]) {
      const res = await postAttempt({ exerciseId, answer: [WRONG_ANSWER] }, users.student);
      expect(res.status).toBe(404);
    }
    expect(await countAttempts()).toBe(before);
  });

  it("400: thiếu cả exerciseId lẫn assignmentId", async () => {
    const res = await postAttempt({ answer: [WRONG_ANSWER] }, users.student);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
describe("Bài giao trước hạn", () => {
  it("201: assignment_id đúng, is_late false, KHÔNG lộ đáp án (kể cả bài riêng DRAFT của GV)", async () => {
    // DRAFT + ngoài thư viện: tự luyện bị chặn nhưng bài giao vẫn làm được.
    const exerciseId = await newFillBlank("DRAFT", false);
    const a = await newAssignment(ids.classA, exerciseId, HOUR);

    const res = await postAttempt(
      { assignmentId: a.id, exerciseId, answer: [WRONG_ANSWER] },
      users.student
    );

    expect(res.status).toBe(201);
    const row = await readAttempt(res.body.data?.attemptId);
    expect(row.assignmentId).toBe(a.id);
    expect(row.exerciseId).toBe(exerciseId);
    expect(row.studentId).toBe(users.student);
    expect(row.isLate).toBe(false);
    expect(row.mode).toBe("practice");
    expect(row.score).toBe(0);
    expect(row.submittedAt.getTime()).toBeLessThanOrEqual(a.dueAt.getTime());

    const data = res.body.data as Record<string, unknown>;
    expect(data.score).toBe(0);
    expect(data.maxScore).toBe(10);
    expect(data.correct).toBe(0);
    expect(data.total).toBe(1);
    expect("answer" in data).toBe(false);
    expect("explanation" in data).toBe(false);
    const errors = errorsOf(data);
    expect(errors.length).toBeGreaterThan(0);
    for (const e of errors) {
      expect(typeof e.type).toBe("string");
      expect("correction" in e).toBe(false);
      expect("explanation" in e).toBe(false);
    }
    // Dò rò rỉ trên toàn bộ JSON
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(SECRET_ANSWER);
    expect(raw).not.toContain(SECRET_EXPLANATION);
  });

  it("201: không gửi exerciseId vẫn được (lấy theo assignment)", async () => {
    const exerciseId = await newFillBlank("PUBLISHED", false);
    const a = await newAssignment(ids.classA, exerciseId, HOUR);
    const res = await postAttempt(
      { assignmentId: a.id, answer: [SECRET_ANSWER] },
      users.student
    );
    expect(res.status).toBe(201);
    expect(res.body.data?.score).toBe(10);
  });

  it("trắc nghiệm: text lỗi là lựa chọn của HS, không lộ đáp án đúng", async () => {
    const exerciseId = await newMultipleChoice("PUBLISHED");
    const a = await newAssignment(ids.classA, exerciseId, HOUR);
    const res = await postAttempt(
      { assignmentId: a.id, answer: [2] },
      users.student
    );

    expect(res.status).toBe(201);
    expect(res.body.data?.score).toBe(0);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(MC_RIGHT_OPTION);
    expect(raw).not.toContain(SECRET_EXPLANATION);
    expect("answer" in (res.body.data as object)).toBe(false);
  });

  it("400: mode không hợp lệ (exam) vẫn bị từ chối", async () => {
    const exerciseId = await newFillBlank("PUBLISHED", false);
    const a = await newAssignment(ids.classA, exerciseId, HOUR);
    const res = await postAttempt(
      { assignmentId: a.id, answer: [WRONG_ANSWER], mode: "exam" },
      users.student
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
describe("Bài giao sau hạn", () => {
  it("201: is_late true, vẫn chấm + lưu, lộ đủ đáp án", async () => {
    const exerciseId = await newFillBlank("PUBLISHED", false);
    const a = await newAssignment(ids.classA, exerciseId, -HOUR);

    const res = await postAttempt(
      { assignmentId: a.id, answer: [WRONG_ANSWER] },
      users.student
    );

    expect(res.status).toBe(201);
    const row = await readAttempt(res.body.data?.attemptId);
    expect(row.assignmentId).toBe(a.id);
    expect(row.isLate).toBe(true);
    expect(row.score).toBe(0);
    expect(row.submittedAt.getTime()).toBeGreaterThan(a.dueAt.getTime());

    expect(res.body.data?.answer).toEqual([SECRET_ANSWER]);
    expect(res.body.data?.explanation).toBe(SECRET_EXPLANATION);
    const errors = errorsOf(res.body.data);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].correction).toBe(SECRET_ANSWER);
  });
});

// ---------------------------------------------------------------------------
describe("Sát biên due_at", () => {
  it("hạn còn 5 giây: chưa trễ, chưa lộ", async () => {
    const exerciseId = await newFillBlank("PUBLISHED", false);
    const a = await newAssignment(ids.classA, exerciseId, 5000);
    const res = await postAttempt(
      { assignmentId: a.id, answer: [WRONG_ANSWER] },
      users.student
    );

    expect(res.status).toBe(201);
    const row = await readAttempt(res.body.data?.attemptId);
    expect(row.isLate).toBe(false);
    expect(row.submittedAt.getTime()).toBeLessThanOrEqual(a.dueAt.getTime());
    expect("answer" in (res.body.data as object)).toBe(false);
  });

  it("hạn đã qua 2 giây: trễ + lộ", async () => {
    const exerciseId = await newFillBlank("PUBLISHED", false);
    const a = await newAssignment(ids.classA, exerciseId, -2000);
    const res = await postAttempt(
      { assignmentId: a.id, answer: [WRONG_ANSWER] },
      users.student
    );

    expect(res.status).toBe(201);
    const row = await readAttempt(res.body.data?.attemptId);
    expect(row.isLate).toBe(true);
    expect(row.submittedAt.getTime()).toBeGreaterThan(a.dueAt.getTime());
    expect(res.body.data?.answer).toEqual([SECRET_ANSWER]);
  });

  it("nhất quán: is_late luôn bằng (submitted_at > due_at) trong DB", async () => {
    const rows = await prisma.attempt.findMany({
      where: { studentId: users.student, assignmentId: { not: null } },
      include: { assignment: { select: { dueAt: true } } },
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.isLate).toBe(r.submittedAt.getTime() > r.assignment!.dueAt.getTime());
    }
  });
});

// ---------------------------------------------------------------------------
describe("Lỗi 404 / 400 của bài giao (không tạo attempt)", () => {
  it("404: assignmentId không tồn tại", async () => {
    const before = await countAttempts();
    const res = await postAttempt(
      { assignmentId: 2147483647, answer: [WRONG_ANSWER] },
      users.student
    );
    expect(res.status).toBe(404);
    expect(await countAttempts()).toBe(before);
  });

  it("404: HS không thuộc lớp của assignment, cùng thông báo với 'không tồn tại'", async () => {
    const exerciseId = await newFillBlank("PUBLISHED", false);
    const a = await newAssignment(ids.classB, exerciseId, HOUR); // student không ở lớp B
    const before = await countAttempts();

    const other = await postAttempt(
      { assignmentId: a.id, answer: [WRONG_ANSWER] },
      users.student
    );
    const missing = await postAttempt(
      { assignmentId: 2147483647, answer: [WRONG_ANSWER] },
      users.student
    );

    expect(other.status).toBe(404);
    expect(other.body.error?.code).toBe(missing.body.error?.code);
    expect(other.body.error?.message).toBe(missing.body.error?.message);
    expect(await countAttempts()).toBe(before);
  });

  it("404: bài của assignment đang HIDDEN", async () => {
    const exerciseId = await newFillBlank("HIDDEN", false);
    const a = await newAssignment(ids.classA, exerciseId, HOUR);
    const before = await countAttempts();

    const res = await postAttempt(
      { assignmentId: a.id, answer: [WRONG_ANSWER] },
      users.student
    );
    expect(res.status).toBe(404);
    expect(await countAttempts()).toBe(before);
  });

  it("400: exerciseId lệch với assignment", async () => {
    const exerciseId = await newFillBlank("PUBLISHED", false);
    const otherExercise = await newFillBlank("PUBLISHED", true);
    const a = await newAssignment(ids.classA, exerciseId, HOUR);
    const before = await countAttempts();

    const res = await postAttempt(
      { assignmentId: a.id, exerciseId: otherExercise, answer: [WRONG_ANSWER] },
      users.student
    );
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
    expect(await countAttempts()).toBe(before);
  });

  it("HS ngoài lớp gửi exerciseId lệch vẫn nhận 404 (không lộ assignment)", async () => {
    const exerciseId = await newFillBlank("PUBLISHED", false);
    const otherExercise = await newFillBlank("PUBLISHED", true);
    const a = await newAssignment(ids.classB, exerciseId, HOUR);

    const res = await postAttempt(
      { assignmentId: a.id, exerciseId: otherExercise, answer: [WRONG_ANSWER] },
      users.student
    );
    expect(res.status).toBe(404);
  });

  it("400: assignmentId sai kiểu (null, 0, chuỗi, số thập phân)", async () => {
    for (const assignmentId of [null, 0, "5", 1.5, -1]) {
      const res = await postAttempt(
        { assignmentId, answer: [WRONG_ANSWER] },
        users.student
      );
      expect(res.status).toBe(400);
    }
  });
});

// ---------------------------------------------------------------------------
describe("Field do client gửi bị bỏ qua", () => {
  it("is_late / submitted_at / studentId / score không có tác dụng (bài giao trước hạn)", async () => {
    const exerciseId = await newFillBlank("PUBLISHED", false);
    const a = await newAssignment(ids.classA, exerciseId, HOUR);

    const res = await postAttempt(
      {
        assignmentId: a.id,
        answer: [WRONG_ANSWER],
        is_late: true,
        isLate: true,
        submitted_at: "2000-01-01T00:00:00Z",
        submittedAt: "2000-01-01T00:00:00Z",
        studentId: users.outsider,
        score: 10,
      },
      users.student
    );

    expect(res.status).toBe(201);
    const row = await readAttempt(res.body.data?.attemptId);
    expect(row.studentId).toBe(users.student);
    expect(row.isLate).toBe(false);
    expect(row.score).toBe(0);
    expect(Math.abs(Date.now() - row.submittedAt.getTime())).toBeLessThan(60_000);
  });

  it("tự luyện: gửi is_late=true vẫn lưu false", async () => {
    const exerciseId = await newFillBlank("PUBLISHED", true);
    const res = await postAttempt(
      { exerciseId, answer: [WRONG_ANSWER], is_late: true, isLate: true },
      users.student
    );
    expect(res.status).toBe(201);
    const row = await readAttempt(res.body.data?.attemptId);
    expect(row.isLate).toBe(false);
  });

  it("bài giao quá hạn: client gửi is_late=false vẫn bị đánh trễ", async () => {
    const exerciseId = await newFillBlank("PUBLISHED", false);
    const a = await newAssignment(ids.classA, exerciseId, -HOUR);
    const res = await postAttempt(
      { assignmentId: a.id, answer: [WRONG_ANSWER], is_late: false, isLate: false },
      users.student
    );
    expect(res.status).toBe(201);
    const row = await readAttempt(res.body.data?.attemptId);
    expect(row.isLate).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("Quyền", () => {
  it("403 cho TEACHER và ADMIN, 401 không token; không tạo attempt", async () => {
    const exerciseId = await newFillBlank("PUBLISHED", false);
    const a = await newAssignment(ids.classA, exerciseId, HOUR);
    const body = { assignmentId: a.id, answer: [WRONG_ANSWER] };
    const before = await prisma.attempt.count({ where: { assignmentId: a.id } });

    expect((await postAttempt(body, users.teacher)).status).toBe(403);
    expect((await postAttempt(body, users.admin)).status).toBe(403);
    expect((await postAttempt(body)).status).toBe(401);

    expect(await prisma.attempt.count({ where: { assignmentId: a.id } })).toBe(before);
  });
});